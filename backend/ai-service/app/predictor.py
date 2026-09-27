"""Load a single model artifact at startup and preserve physical fallbacks."""
from __future__ import annotations

import json
import logging
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
import pandas as pd
try:
    from xgboost.core import XGBoostError
except ImportError:  # The physical fallback must still start in legacy installs.
    class XGBoostError(Exception):
        pass

from app.schemas import EstimationRequest, EstimationResponse, Prediction
from training.config import PhysicalCurveConfig, default_artifact_dir
from training.evaluate import interval_bounds
from training.features import FEATURE_COLUMNS, add_features, feature_matrix
from training.physical_curve import apply_physical_bounds, physical_power_mw


@dataclass
class Predictor:
    artifact_dir: Path
    model: Any | None
    metadata: dict
    intervals: dict

    @classmethod
    def from_artifacts(cls, artifact_dir: Path | None = None) -> "Predictor":
        directory = artifact_dir or default_artifact_dir()
        metadata_file, interval_file = directory / "metadata.json", directory / "residual_quantiles.json"
        if not (metadata_file.exists() and interval_file.exists()):
            return cls(directory, None, {"model_version": "physical-curve-v1", "model_scope": "physical_fallback", "approved": False}, {})
        try:
            metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
            intervals = json.loads(interval_file.read_text(encoding="utf-8"))
            schema = metadata.get("artifact_schema_version", "legacy-temporal-70-15-15")
            model_file = directory / metadata.get("model_file", "model.txt")
            if not model_file.is_file():
                raise ValueError("Arquivo de modelo ausente.")
            if metadata.get("feature_order") != FEATURE_COLUMNS or intervals.get("unit") != "capacity_factor":
                raise ValueError("Artefato incompatível: features ou intervalos.")
            PhysicalCurveConfig(**metadata["physical_curve"])
            if not metadata.get("model_version"):
                raise ValueError("Metadata inválido.")
            if metadata.get("model_scope") != "global":
                raise ValueError("Escopo incompatível com a Fase 1.")
            if hashlib.sha256(model_file.read_bytes()).hexdigest() != metadata["model_sha256"]:
                raise ValueError("Modelo não corresponde ao metadata.")
            if schema == "legacy-temporal-70-15-15":
                if not isinstance(metadata.get("approved"), bool):
                    raise ValueError("Metadata legado inválido.")
                metrics = metadata["metrics"]
                baseline_mae = metrics["baseline_test"]["overall"]["mae_mw"]
                hybrid_mae = metrics["hybrid_test"]["overall"]["mae_mw"]
                if not np.isfinite([baseline_mae, hybrid_mae]).all() or metadata["approved"] != (hybrid_mae < baseline_mae):
                    raise ValueError("Decisão de aprovação incompatível com as métricas.")
            elif schema == "temporal-protocol-v1":
                homologation = metadata.get("operational_homologation", {})
                final_report_file = directory / "final_evaluation_report.json"
                protocol_file = directory / "protocol_manifest.json"
                if not final_report_file.is_file() or not protocol_file.is_file():
                    raise ValueError("Relatório final ou manifesto do protocolo ausente.")
                final_report = json.loads(final_report_file.read_text(encoding="utf-8"))
                protocol_manifest = json.loads(protocol_file.read_text(encoding="utf-8"))
                protocol_sha = hashlib.sha256(json.dumps(
                    protocol_manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
                    allow_nan=False).encode("utf-8")).hexdigest()
                if (metadata.get("state") != "operationally_homologated"
                        or protocol_manifest.get("state") != "operationally_homologated"
                        or protocol_manifest.get("protocol_version") != metadata.get("protocol_version")
                        or protocol_sha != metadata.get("protocol_manifest_sha256")
                        or metadata.get("scientifically_approved") is not True
                        or final_report.get("scientifically_approved") is not True
                        or homologation.get("status") is not True
                        or homologation.get("model_sha256") != metadata["model_sha256"]
                        or homologation.get("calibration_sha256") != metadata.get("calibration_sha256")
                        or homologation.get("final_report_sha256") != metadata.get("final_report_sha256")
                        or hashlib.sha256(final_report_file.read_bytes()).hexdigest() != metadata.get("final_report_sha256")
                        or final_report.get("model_sha256") != metadata["model_sha256"]
                        or final_report.get("calibration_sha256") != metadata.get("calibration_sha256")
                        or hashlib.sha256(interval_file.read_bytes()).hexdigest() != metadata.get("calibration_sha256")):
                    raise ValueError("Artefato novo sem homologação operacional compatível.")
                metadata["approved"] = True
            else:
                raise ValueError("Versão de artefato desconhecida.")
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
            algorithm = metadata.get("algorithm", "lightgbm")
            if algorithm == "lightgbm":
                model = lgb.Booster(model_file=str(model_file))
                if model.feature_name() != FEATURE_COLUMNS:
                    raise ValueError("Features do modelo incompatíveis.")
            elif algorithm == "xgboost":
                import xgboost as xgb
                model = xgb.XGBRegressor()
                model.load_model(str(model_file))
                if model.get_booster().feature_names != FEATURE_COLUMNS:
                    raise ValueError("Features do modelo incompatíveis.")
            else:
                raise ValueError("Algoritmo incompatível.")
            return cls(directory, model, metadata, intervals)
        except (OSError, ValueError, KeyError, TypeError, AttributeError, ImportError,
                lgb.basic.LightGBMError, XGBoostError) as exc:
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
                matrix = feature_matrix(raw)
                correction = np.asarray(
                    self.model.predict(matrix, num_threads=1)
                    if self.metadata.get("algorithm", "lightgbm") == "lightgbm"
                    else self.model.predict(matrix)
                ) * request.capacidade_instalada_mw
                if correction.shape != (len(raw),) or not np.isfinite(correction).all():
                    raise ValueError("Correção inválida.")
            except (ValueError, lgb.basic.LightGBMError, XGBoostError):
                correction = np.zeros(len(raw))
                use_ml = False
                warnings.append("falha_na_correcao_ml: usando_curva_fisica")
        final = apply_physical_bounds(baseline, correction, wind, request.capacidade_instalada_mw, availability, curve)
        scope = self.metadata["model_scope"] if use_ml else "physical_fallback"
        predictions = []
        lower = upper = None
        if use_ml:
            lower, upper = interval_bounds(final, wind, request.capacidade_instalada_mw,
                                            availability, self.intervals, curve)
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
                limite_inferior_mw=round(float(lower[index]), 6) if lower is not None else None,
                limite_superior_mw=round(float(upper[index]), 6) if upper is not None else None,
                confianca="media" if use_ml else "baixa",
                warnings=local_warnings,
            ))
        return EstimationResponse(usina_id=request.usina_id, model_version=self.version, model_scope=scope, predicoes=predictions)
