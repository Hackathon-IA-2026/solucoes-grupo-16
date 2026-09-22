"""Load a single model artifact at startup and preserve physical fallbacks."""
from __future__ import annotations

import json
import logging
import hashlib
from dataclasses import dataclass
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from app.schemas import EstimationRequest, EstimationResponse, Prediction
from training.config import PhysicalCurveConfig, default_artifact_dir
from training.evaluate import interval_bounds
from training.features import FEATURE_COLUMNS, add_features, feature_matrix
from training.physical_curve import apply_physical_bounds, physical_power_mw


@dataclass
class Predictor:
    artifact_dir: Path
    model: lgb.Booster | None
    metadata: dict
    intervals: dict

    @classmethod
    def from_artifacts(cls, artifact_dir: Path | None = None) -> "Predictor":
        directory = artifact_dir or default_artifact_dir()
        metadata_file, model_file, interval_file = directory / "metadata.json", directory / "model.txt", directory / "residual_quantiles.json"
        if not (metadata_file.exists() and model_file.exists() and interval_file.exists()):
            return cls(directory, None, {"model_version": "physical-curve-v1", "model_scope": "physical_fallback", "approved": False}, {})
        try:
            metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
            intervals = json.loads(interval_file.read_text(encoding="utf-8"))
            if metadata.get("feature_order") != FEATURE_COLUMNS or intervals.get("unit") != "capacity_factor":
                raise ValueError("Artefato incompatível: features ou intervalos.")
            PhysicalCurveConfig(**metadata["physical_curve"])
            if not isinstance(metadata["approved"], bool) or not metadata["model_version"]:
                raise ValueError("Metadata inválido.")
            if metadata.get("model_scope") != "global":
                raise ValueError("Escopo incompatível com a Fase 1.")
            if hashlib.sha256(model_file.read_bytes()).hexdigest() != metadata["model_sha256"]:
                raise ValueError("Modelo não corresponde ao metadata.")
            metrics = metadata["metrics"]
            baseline_mae = metrics["baseline_test"]["overall"]["mae_mw"]
            hybrid_mae = metrics["hybrid_test"]["overall"]["mae_mw"]
            if not np.isfinite([baseline_mae, hybrid_mae]).all() or metadata["approved"] != (hybrid_mae < baseline_mae):
                raise ValueError("Decisão de aprovação incompatível com as métricas.")
            if not metadata.get("input_domain") or not metadata.get("training_usina_ids"):
                raise ValueError("Domínio de treino ausente.")
            expected_domain = {"wind_speed_100m", "temperature_2m", "surface_pressure", "capacidade_instalada_mw", "disponibilidade"}
            if set(metadata["input_domain"]) != expected_domain:
                raise ValueError("Campos de domínio incompatíveis.")
            for limits in metadata["input_domain"].values():
                if not np.isfinite([limits["min"], limits["max"]]).all() or limits["min"] > limits["max"]:
                    raise ValueError("Domínio inválido.")
            for quantiles in [intervals["global"], *intervals["wind_bands"].values()]:
                if not np.isfinite([quantiles["p05"], quantiles["p95"]]).all() or quantiles["p05"] > quantiles["p95"]:
                    raise ValueError("Quantis inválidos.")
            model = lgb.Booster(model_file=str(model_file))
            if model.feature_name() != FEATURE_COLUMNS:
                raise ValueError("Features do modelo incompatíveis.")
            return cls(directory, model, metadata, intervals)
        except (OSError, ValueError, KeyError, TypeError, AttributeError, lgb.basic.LightGBMError) as exc:
            logging.getLogger(__name__).warning("Artefato inválido; fallback físico: %s", exc)
            return cls(directory, None, {"model_version": "physical-curve-v1", "model_scope": "physical_fallback",
                                         "approved": False, "artifact_warning": "artefato_invalido: usando_curva_fisica"}, {})

    @property
    def version(self) -> str:
        return self.metadata["model_version"]

    @property
    def approved(self) -> bool:
        return bool(self.model is not None and self.metadata.get("approved"))

    def health(self) -> dict:
        return {"status": "ok", "model_version": self.version,
                "model_scope": self.metadata["model_scope"] if self.approved else "physical_fallback", "model_approved": self.approved}

    def _curve_config(self) -> PhysicalCurveConfig:
        values = self.metadata.get("physical_curve", {})
        return PhysicalCurveConfig(**values) if values else PhysicalCurveConfig()

    def _outside_domain(self, frame: pd.DataFrame, usina_id: str) -> bool:
        if usina_id not in self.metadata.get("training_usina_ids", []):
            return True
        return any(not frame[column].between(limits["min"], limits["max"]).all()
                   for column, limits in self.metadata.get("input_domain", {}).items())

    def estimate(self, request: EstimationRequest) -> EstimationResponse:
        raw = pd.DataFrame([record.model_dump() for record in request.registros])
        raw["usina_id"] = request.usina_id
        raw["capacidade_instalada_mw"] = request.capacidade_instalada_mw
        raw["disponibilidade"] = pd.to_numeric(
            raw["disponibilidade"], errors="coerce"
        ).fillna(request.disponibilidade)
        features_frame = add_features(raw)
        wind = features_frame["wind_speed_100m"].to_numpy()
        curve = self._curve_config()
        availability = raw["disponibilidade"].to_numpy(dtype=float)
        baseline = physical_power_mw(
            wind, request.capacidade_instalada_mw, availability, curve
        )
        warnings: list[str] = []
        use_ml = self.approved and not self._outside_domain(features_frame, request.usina_id)
        if not self.approved:
            warnings.append("modelo_hibrido_indisponivel_ou_reprovado: usando_curva_fisica")
        elif not use_ml:
            warnings.append("entrada_fora_do_dominio_do_treino: usando_curva_fisica")
        if self.metadata.get("artifact_warning"):
            warnings.append(self.metadata["artifact_warning"])
        correction = np.zeros(len(raw))
        if use_ml:
            try:
                correction = np.asarray(self.model.predict(feature_matrix(raw), num_threads=1)) * request.capacidade_instalada_mw
                if correction.shape != (len(raw),) or not np.isfinite(correction).all():
                    raise ValueError("Correção inválida.")
            except (ValueError, lgb.basic.LightGBMError):
                correction = np.zeros(len(raw))
                use_ml = False
                warnings.append("falha_na_correcao_ml: usando_curva_fisica")
        final = apply_physical_bounds(baseline, correction, wind, request.capacidade_instalada_mw, request.disponibilidade, curve)
        scope = self.metadata["model_scope"] if use_ml else "physical_fallback"
        predictions = []
        lower = upper = None
        if use_ml:
            lower, upper = interval_bounds(final, wind, request.capacidade_instalada_mw,
                                            request.disponibilidade, self.intervals, curve)
            warnings.append("intervalo_empirico: sem_garantia_probabilistica")
        else:
            warnings.append("incerteza_nao_calibrada: limites_indisponiveis")
        for index, record in enumerate(request.registros):
            local_warnings = warnings.copy()
            if wind[index] < curve.cut_in_ms or wind[index] >= curve.cut_out_ms:
                local_warnings.append("vento_fora_da_faixa_operacional: geracao_zero_pela_regra_fisica")
            predictions.append(Prediction(
                timestamp_utc=record.timestamp_utc,
                baseline_mw=round(float(baseline[index]), 6),
                correcao_ml_mw=round(float(final[index] - baseline[index]), 6),
                geracao_estimada_mw=round(float(final[index]), 6),
                limite_inferior_mw=round(float(np.clip(final[index] - radius, 0, available[index])), 6),
                limite_superior_mw=round(float(np.clip(final[index] + radius, 0, available[index])), 6),
                confianca="media" if use_ml else "baixa",
                warnings=local_warnings,
            ))
        return EstimationResponse(usina_id=request.usina_id, model_version=self.version, model_scope=scope, predicoes=predictions)
