"""Partially linear DML challenger for the effect of air density."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import math
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np
import pandas as pd

from training.causal.spec import CausalEstimandSpec
from training.causal.temporal_crossfit import expanding_time_splits
from training.features import add_features
from training.protocol import canonical_bytes, file_sha256


ARTIFACT_SCHEMA_VERSION = "causal-dml-plr-v1"


@dataclass(frozen=True)
class NuisanceConfig:
    n_estimators: int = 250
    learning_rate: float = 0.04
    num_leaves: int = 31
    min_child_samples: int = 50
    subsample: float = 0.8
    colsample_bytree: float = 0.8
    reg_lambda: float = 5.0
    random_state: int = 42
    n_jobs: int = 1

    def __post_init__(self) -> None:
        if (type(self.n_estimators) is not int or self.n_estimators < 1
                or not math.isfinite(self.learning_rate) or self.learning_rate <= 0
                or type(self.num_leaves) is not int or self.num_leaves < 2
                or type(self.min_child_samples) is not int or self.min_child_samples < 1
                or not 0 < self.subsample <= 1 or not 0 < self.colsample_bytree <= 1
                or self.reg_lambda < 0 or self.n_jobs == 0):
            raise ValueError("Configuração dos nuisance models é inválida.")


def _resolved_feature_order(spec: CausalEstimandSpec) -> list[str]:
    return ["usina_code" if name == "usina_id" else name for name in spec.controls]


def _plant_ids(frame: pd.DataFrame) -> tuple[str, ...]:
    values = frame["usina_id"].astype("string")
    if values.isna().any() or values.str.strip().eq("").any():
        raise ValueError("DML exige usina_id não vazio.")
    return tuple(sorted(values.astype(str).unique().tolist()))


def _inputs(
    frame: pd.DataFrame,
    spec: CausalEstimandSpec,
    plant_ids: tuple[str, ...],
) -> tuple[pd.DataFrame, np.ndarray]:
    enriched = add_features(frame)
    mapping = {plant: index for index, plant in enumerate(plant_ids)}
    enriched["usina_code"] = enriched["usina_id"].astype(str).map(mapping).fillna(-1).astype("int32")
    feature_order = _resolved_feature_order(spec)
    missing = sorted(set(feature_order + [spec.treatment]) - set(enriched.columns))
    if missing:
        raise ValueError(f"Entradas causais ausentes: {missing}.")
    matrix = enriched.loc[:, feature_order].copy()
    for name in feature_order:
        matrix[name] = pd.to_numeric(matrix[name], errors="coerce")
    invalid_infinite = np.isinf(matrix.to_numpy(dtype=float)).any()
    if invalid_infinite:
        raise ValueError("Controles causais contêm infinitos.")
    treatment = pd.to_numeric(enriched[spec.treatment], errors="coerce").to_numpy(dtype=float)
    if not np.isfinite(treatment).all():
        raise ValueError("Tratamento causal deve ser finito em todas as linhas.")
    return matrix, treatment


def _regressor(config: NuisanceConfig) -> lgb.LGBMRegressor:
    return lgb.LGBMRegressor(
        objective="regression_l2",
        n_estimators=config.n_estimators,
        learning_rate=config.learning_rate,
        num_leaves=config.num_leaves,
        min_child_samples=config.min_child_samples,
        subsample=config.subsample,
        subsample_freq=1,
        colsample_bytree=config.colsample_bytree,
        reg_lambda=config.reg_lambda,
        random_state=config.random_state,
        n_jobs=config.n_jobs,
        deterministic=True,
        force_col_wise=True,
        verbosity=-1,
    )


def _fit_regressor(features: pd.DataFrame, target: np.ndarray, config: NuisanceConfig):
    model = _regressor(config)
    categorical = ["usina_code"] if "usina_code" in features else "auto"
    model.fit(features, target, categorical_feature=categorical)
    return model


def _metrics(observed: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    error = observed - predicted
    denominator = float(np.sum((observed - observed.mean()) ** 2))
    return {
        "mae": float(np.mean(np.abs(error))),
        "rmse": float(np.sqrt(np.mean(error ** 2))),
        "r2": float(1 - np.sum(error ** 2) / denominator) if denominator > 0 else 0.0,
    }


def _block_standard_error(
    timestamps: pd.Series,
    outcome_residual: np.ndarray,
    treatment_residual: np.ndarray,
    theta: float,
    cluster_hours: int,
) -> tuple[float, int]:
    values = pd.to_datetime(timestamps, utc=True)
    origin = values.min()
    clusters = ((values - origin).dt.total_seconds() // (cluster_hours * 3600)).astype(int)
    score = treatment_residual * (outcome_residual - theta * treatment_residual)
    sums = pd.Series(score).groupby(clusters.reset_index(drop=True)).sum().to_numpy(dtype=float)
    cluster_count = len(sums)
    if cluster_count < 2:
        return float("nan"), cluster_count
    jacobian = float(np.mean(treatment_residual ** 2))
    variance = (cluster_count / (cluster_count - 1)) * float(np.sum(sums ** 2))
    variance /= len(score) ** 2 * jacobian ** 2
    return float(np.sqrt(max(variance, 0.0))), cluster_count


@dataclass
class DMLPLRModel:
    spec: CausalEstimandSpec
    nuisance_config: NuisanceConfig
    theta: float
    outcome_model: Any
    treatment_model: Any
    plant_ids: tuple[str, ...]
    diagnostics: dict[str, Any]

    def predict_residual_cf(self, frame: pd.DataFrame) -> np.ndarray:
        features, treatment = _inputs(frame, self.spec, self.plant_ids)
        outcome_mean = np.asarray(self.outcome_model.predict(features), dtype=float)
        treatment_mean = np.asarray(self.treatment_model.predict(features), dtype=float)
        prediction = outcome_mean + self.theta * (treatment - treatment_mean)
        if prediction.shape != (len(frame),) or not np.isfinite(prediction).all():
            raise ValueError("Predição DML inválida.")
        return prediction

    def save(self, artifact_dir: Path, *, provenance: dict[str, Any] | None = None) -> dict[str, Any]:
        artifact_dir.mkdir(parents=True, exist_ok=False)
        outcome_path = artifact_dir / "outcome_model.txt"
        treatment_path = artifact_dir / "treatment_model.txt"
        diagnostics_path = artifact_dir / "causal_diagnostics.json"
        outcome_booster = self.outcome_model.booster_ if hasattr(self.outcome_model, "booster_") else self.outcome_model
        treatment_booster = self.treatment_model.booster_ if hasattr(self.treatment_model, "booster_") else self.treatment_model
        outcome_booster.save_model(str(outcome_path))
        treatment_booster.save_model(str(treatment_path))
        diagnostics_path.write_bytes(canonical_bytes(self.diagnostics) + b"\n")
        metadata = {
            "artifact_schema_version": ARTIFACT_SCHEMA_VERSION,
            "model_family": "dml_plr",
            "model_version": "dml-plr-density-v1",
            "status": self.spec.status,
            "created_at_utc": datetime.now(timezone.utc).isoformat(),
            "estimand": self.spec.serializable(),
            "estimand_sha256": self.spec.digest(),
            "nuisance_config": asdict(self.nuisance_config),
            "theta": self.theta,
            "feature_order": _resolved_feature_order(self.spec),
            "plant_ids": list(self.plant_ids),
            "provenance": provenance or {"scope": "standalone_infrastructure_test"},
            "files": {
                "outcome_model.txt": file_sha256(outcome_path),
                "treatment_model.txt": file_sha256(treatment_path),
                "causal_diagnostics.json": file_sha256(diagnostics_path),
            },
        }
        (artifact_dir / "metadata.json").write_bytes(canonical_bytes(metadata) + b"\n")
        return metadata

    @classmethod
    def load(cls, artifact_dir: Path) -> "DMLPLRModel":
        metadata = json.loads((artifact_dir / "metadata.json").read_text(encoding="utf-8"))
        if metadata.get("artifact_schema_version") != ARTIFACT_SCHEMA_VERSION:
            raise ValueError("Bundle DML incompatível.")
        for name, expected in metadata["files"].items():
            if file_sha256(artifact_dir / name) != expected:
                raise ValueError(f"Hash divergente no bundle DML: {name}.")
        spec = CausalEstimandSpec.from_dict(metadata["estimand"])
        if spec.digest() != metadata["estimand_sha256"]:
            raise ValueError("Contrato causal diverge do hash registrado.")
        diagnostics = json.loads((artifact_dir / "causal_diagnostics.json").read_text(encoding="utf-8"))
        return cls(
            spec=spec,
            nuisance_config=NuisanceConfig(**metadata["nuisance_config"]),
            theta=float(metadata["theta"]),
            outcome_model=lgb.Booster(model_file=str(artifact_dir / "outcome_model.txt")),
            treatment_model=lgb.Booster(model_file=str(artifact_dir / "treatment_model.txt")),
            plant_ids=tuple(metadata["plant_ids"]),
            diagnostics=diagnostics,
        )


def fit_dml_plr(
    frame: pd.DataFrame,
    spec: CausalEstimandSpec = CausalEstimandSpec(),
    nuisance_config: NuisanceConfig = NuisanceConfig(),
) -> DMLPLRModel:
    """Fit cross-fitted nuisance models, the orthogonal coefficient and final models."""
    if spec.outcome not in frame:
        raise ValueError(f"Outcome causal ausente: {spec.outcome}.")
    work = frame.reset_index(drop=True).copy()
    outcome = pd.to_numeric(work[spec.outcome], errors="coerce").to_numpy(dtype=float)
    if not np.isfinite(outcome).all():
        raise ValueError("Outcome causal deve ser finito em todas as linhas.")
    plants = _plant_ids(work)
    features, treatment = _inputs(work, spec, plants)
    folds = expanding_time_splits(
        work["timestamp_utc"],
        n_splits=spec.n_crossfit_splits,
        gap_hours=spec.crossfit_gap_hours,
    )
    outcome_oof = np.full(len(work), np.nan)
    treatment_oof = np.full(len(work), np.nan)
    fold_reports: list[dict[str, Any]] = []
    for fold in folds:
        outcome_model = _fit_regressor(
            features.iloc[fold.train_indices], outcome[fold.train_indices], nuisance_config)
        treatment_model = _fit_regressor(
            features.iloc[fold.train_indices], treatment[fold.train_indices], nuisance_config)
        outcome_prediction = np.asarray(outcome_model.predict(features.iloc[fold.evaluation_indices]))
        treatment_prediction = np.asarray(treatment_model.predict(features.iloc[fold.evaluation_indices]))
        outcome_oof[fold.evaluation_indices] = outcome_prediction
        treatment_oof[fold.evaluation_indices] = treatment_prediction
        fold_reports.append({
            "fold_id": fold.fold_id,
            "train_start_utc": fold.train_start_utc,
            "train_end_utc": fold.train_end_utc,
            "evaluation_start_utc": fold.evaluation_start_utc,
            "evaluation_end_utc": fold.evaluation_end_utc,
            "train_rows": int(len(fold.train_indices)),
            "evaluation_rows": int(len(fold.evaluation_indices)),
            "outcome_nuisance": _metrics(outcome[fold.evaluation_indices], outcome_prediction),
            "treatment_nuisance": _metrics(treatment[fold.evaluation_indices], treatment_prediction),
        })
    oof_mask = np.isfinite(outcome_oof) & np.isfinite(treatment_oof)
    if int(oof_mask.sum()) < spec.minimum_oof_rows:
        raise ValueError("Amostra causal out-of-fold menor que o mínimo declarado.")
    outcome_residual = outcome[oof_mask] - outcome_oof[oof_mask]
    treatment_residual = treatment[oof_mask] - treatment_oof[oof_mask]
    residual_std = float(np.std(treatment_residual, ddof=1))
    if not math.isfinite(residual_std) or residual_std < spec.minimum_treatment_residual_std:
        raise ValueError("Sem overlap: densidade residual praticamente determinada pelos controles.")
    denominator = float(np.dot(treatment_residual, treatment_residual))
    if denominator <= 0:
        raise ValueError("Score DML degenerado.")
    theta = float(np.dot(treatment_residual, outcome_residual) / denominator)
    oof_timestamps = work.loc[oof_mask, "timestamp_utc"].reset_index(drop=True)
    standard_error, cluster_count = _block_standard_error(
        oof_timestamps,
        outcome_residual,
        treatment_residual,
        theta,
        spec.inference_cluster_hours,
    )
    ci = ([theta - 1.96 * standard_error, theta + 1.96 * standard_error]
          if math.isfinite(standard_error) else [None, None])
    sign_matches = (theta > 0 if spec.expected_effect_sign == "positive"
                    else theta < 0 if spec.expected_effect_sign == "negative" else None)
    diagnostics = {
        "artifact_schema_version": "causal-diagnostics-v1",
        "estimand_id": spec.estimand_id,
        "status": spec.status,
        "theta": theta,
        "theta_unit": "residual_capacity_factor_per_kg_m3",
        "standard_error": standard_error if math.isfinite(standard_error) else None,
        "confidence_interval_95": ci,
        "inference_method": "exploratory_clustered_orthogonal_score",
        "inference_cluster_hours": spec.inference_cluster_hours,
        "inference_cluster_count": cluster_count,
        "expected_effect_sign": spec.expected_effect_sign,
        "expected_sign_matches": sign_matches,
        "rows_total": len(work),
        "rows_oof": int(oof_mask.sum()),
        "warmup_rows": int((~oof_mask).sum()),
        "treatment_residual_std": residual_std,
        "treatment_residual_quantiles": {
            "p01": float(np.quantile(treatment_residual, 0.01)),
            "p50": float(np.quantile(treatment_residual, 0.50)),
            "p99": float(np.quantile(treatment_residual, 0.99)),
        },
        "outcome_nuisance_oof": _metrics(outcome[oof_mask], outcome_oof[oof_mask]),
        "treatment_nuisance_oof": _metrics(treatment[oof_mask], treatment_oof[oof_mask]),
        "folds": fold_reports,
        "causal_warning": (
            "DML reduz viés de regularização sob o contrato declarado; não prova ausência de "
            "confundidores não observados nem implica ganho preditivo."
        ),
    }
    final_outcome_model = _fit_regressor(features, outcome, nuisance_config)
    final_treatment_model = _fit_regressor(features, treatment, nuisance_config)
    return DMLPLRModel(
        spec=spec,
        nuisance_config=nuisance_config,
        theta=theta,
        outcome_model=final_outcome_model,
        treatment_model=final_treatment_model,
        plant_ids=plants,
        diagnostics=diagnostics,
    )
