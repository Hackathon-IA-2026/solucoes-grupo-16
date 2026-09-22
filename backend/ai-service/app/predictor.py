"""Load a single model artifact at startup and preserve physical fallbacks."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from app.schemas import EstimationRequest, EstimationResponse, Prediction
from training.config import PhysicalCurveConfig, default_artifact_dir
from training.evaluate import WIND_BINS, WIND_LABELS
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
        metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
        intervals = json.loads(interval_file.read_text(encoding="utf-8"))
        if metadata.get("feature_order") != FEATURE_COLUMNS:
            raise RuntimeError("Artefato incompatível: a ordem de features não corresponde ao serviço.")
        return cls(directory, lgb.Booster(model_file=str(model_file)), metadata, intervals)

    @property
    def version(self) -> str:
        return self.metadata["model_version"]

    @property
    def approved(self) -> bool:
        return bool(self.model is not None and self.metadata.get("approved"))

    def health(self) -> dict:
        return {"status": "ok", "model_version": self.version, "model_scope": self.metadata["model_scope"], "model_approved": self.approved}

    def _curve_config(self) -> PhysicalCurveConfig:
        values = self.metadata.get("physical_curve", {})
        return PhysicalCurveConfig(**values) if values else PhysicalCurveConfig()

    def _outside_domain(self, wind: np.ndarray) -> bool:
        domain = self.metadata.get("wind_speed_domain_ms")
        return bool(domain and ((wind < domain["min"]).any() or (wind > domain["max"]).any()))

    def _uncertainty(self, wind_speed: float) -> float:
        if not self.intervals:
            return 0.0
        band = str(pd.cut([wind_speed], WIND_BINS, labels=WIND_LABELS, right=False)[0])
        return float(self.intervals.get("wind_bands", {}).get(band, self.intervals.get("global", {})).get("p95", 0.0))

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
        use_ml = self.approved and not self._outside_domain(wind)
        if not self.approved:
            warnings.append("modelo_hibrido_indisponivel_ou_reprovado: usando_curva_fisica")
        elif self._outside_domain(wind):
            warnings.append("entrada_fora_do_dominio_do_treino: usando_curva_fisica")
        correction = np.zeros(len(raw))
        if use_ml:
            correction = self.model.predict(feature_matrix(raw)) * request.capacidade_instalada_mw
        final = apply_physical_bounds(
            baseline,
            correction,
            wind,
            request.capacidade_instalada_mw,
            availability,
            curve,
        )
        scope = self.metadata["model_scope"] if use_ml else "physical_fallback"
        predictions = []
        available = request.capacidade_instalada_mw * availability
        for index, record in enumerate(request.registros):
            local_warnings = warnings.copy()
            if wind[index] < curve.cut_in_ms or wind[index] >= curve.cut_out_ms:
                local_warnings.append("vento_fora_da_faixa_operacional: geracao_zero_pela_regra_fisica")
            radius = self._uncertainty(float(wind[index])) if use_ml else 0.0
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
