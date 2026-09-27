"""Sequential residual adaptation with later, untouched monthly checkpoints.

The experiment deliberately distinguishes three roles for a month:

* development (August 2024): fit the original LightGBM and DML models;
* adaptation (September 2024, then January 2026): learn only the residual left
  by the previously frozen predictor using an internal chronological split;
* checkpoint (January 2026, then April 2026): evaluate frozen predictors before
  the checkpoint target is exposed to the next adaptation stage.

April is never used for fitting or parameter selection in this experiment.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

import lightgbm as lgb
import numpy as np
import pandas as pd

from ingestion.common.io import (
    atomic_write_json,
    atomic_write_parquet,
    read_tabular,
    sha256_file,
    utc_now_iso,
)
from training.build_dataset import prepare_snapshot
from training.causal.dml_plr import NuisanceConfig, fit_dml_plr
from training.causal.spec import CausalEstimandSpec
from training.config import TrainingConfig, load_config
from training.evaluate import regression_metrics
from training.features import FEATURE_COLUMNS
from training.physical_curve import apply_physical_bounds
from training.protocol import sha256_json
from training.train import _prepared


SCHEMA_VERSION = "climagrid-sequential-residual-v2"


@dataclass(frozen=True)
class ResidualCandidate:
    candidate_id: str
    n_estimators: int
    learning_rate: float
    num_leaves: int
    min_child_samples: int
    reg_lambda: float

    @classmethod
    def from_dict(cls, values: dict[str, Any]) -> "ResidualCandidate":
        candidate = cls(**values)
        if (
            not candidate.candidate_id
            or candidate.n_estimators < 1
            or candidate.learning_rate <= 0
            or candidate.num_leaves < 2
            or candidate.min_child_samples < 1
            or candidate.reg_lambda < 0
        ):
            raise ValueError("Candidato residual inválido.")
        return candidate


DEFAULT_CANDIDATES = (
    ResidualCandidate("conservative", 250, 0.025, 15, 200, 10.0),
    ResidualCandidate("balanced", 350, 0.040, 31, 100, 5.0),
    ResidualCandidate("flexible", 500, 0.035, 63, 50, 5.0),
    ResidualCandidate("smooth_long", 650, 0.020, 31, 150, 10.0),
    ResidualCandidate("fast_regularized", 250, 0.060, 31, 150, 10.0),
    ResidualCandidate("wide_regularized", 400, 0.030, 63, 100, 15.0),
)
DEFAULT_SCALES = (0.25, 0.50, 0.75, 1.0)
DEFAULT_CALIBRATION_FACTORS = tuple(float(value) for value in np.round(
    np.arange(0.70, 1.401, 0.01), 2
))


def _residual_model(candidate: ResidualCandidate, config: TrainingConfig) -> lgb.LGBMRegressor:
    return lgb.LGBMRegressor(
        objective="regression_l1",
        n_estimators=candidate.n_estimators,
        learning_rate=candidate.learning_rate,
        num_leaves=candidate.num_leaves,
        min_child_samples=candidate.min_child_samples,
        subsample=config.lightgbm.subsample,
        subsample_freq=1,
        colsample_bytree=config.lightgbm.colsample_bytree,
        reg_lambda=candidate.reg_lambda,
        random_state=config.random_state,
        n_jobs=config.n_jobs,
        deterministic=True,
        force_col_wise=True,
        verbosity=-1,
    )


def _base_lightgbm(config: TrainingConfig) -> lgb.LGBMRegressor:
    values = config.lightgbm
    return lgb.LGBMRegressor(
        objective="regression_l1",
        n_estimators=min(values.n_estimators, 500),
        learning_rate=values.learning_rate,
        num_leaves=values.num_leaves,
        min_child_samples=values.min_child_samples,
        subsample=values.subsample,
        subsample_freq=1,
        colsample_bytree=values.colsample_bytree,
        reg_lambda=values.reg_lambda,
        random_state=config.random_state,
        n_jobs=config.n_jobs,
        deterministic=True,
        force_col_wise=True,
        verbosity=-1,
    )


def _bounded_addition(
    frame: pd.DataFrame,
    prior_mw: Iterable[float],
    correction_cf: Iterable[float],
    scale: float,
    config: TrainingConfig,
) -> np.ndarray:
    correction_mw = (
        np.asarray(list(correction_cf), dtype=float)
        * frame["capacidade_instalada_mw"].to_numpy(dtype=float)
        * scale
    )
    return apply_physical_bounds(
        np.asarray(list(prior_mw), dtype=float),
        correction_mw,
        frame["wind_speed_hub_m"],
        frame["capacidade_instalada_mw"],
        frame["disponibilidade"],
        config.physical_curve,
    )


def _prediction_metrics(frame: pd.DataFrame, column: str) -> dict[str, Any]:
    result = regression_metrics(
        frame["target_mw"], frame[column], frame["capacidade_instalada_mw"]
    )
    target_total = float(frame["target_mw"].sum())
    prediction_total = float(frame[column].sum())
    result.update({
        "target_total_mwh": target_total,
        "prediction_total_mwh": prediction_total,
        "signed_total_error_fraction": (
            None if target_total == 0 else (prediction_total - target_total) / target_total
        ),
    })
    return result


def _hourly_metrics(frame: pd.DataFrame, column: str) -> dict[str, Any]:
    hourly = frame.groupby("timestamp_utc", as_index=False).agg(
        target_mw=("target_mw", "sum"),
        prediction_mw=(column, "sum"),
        capacidade_instalada_mw=("capacidade_instalada_mw", "sum"),
    )
    return _prediction_metrics(hourly, "prediction_mw")


def _metrics(frame: pd.DataFrame, columns: dict[str, str]) -> dict[str, Any]:
    return {
        name: {
            "plant_hour": _prediction_metrics(frame, column),
            "hourly_total": _hourly_metrics(frame, column),
        }
        for name, column in columns.items()
    }


def _period(frame: pd.DataFrame) -> dict[str, Any]:
    timestamps = pd.to_datetime(frame["timestamp_utc"], utc=True)
    return {
        "start_utc": timestamps.min().isoformat(),
        "end_utc": timestamps.max().isoformat(),
        "rows": int(len(frame)),
        "hours": int(timestamps.nunique()),
        "plants": int(frame["usina_id"].nunique()),
    }


def _chronological_adaptation_split(
    frame: pd.DataFrame,
    *,
    train_fraction: float,
    gap_hours: int,
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    timestamps = pd.Index(frame["timestamp_utc"].drop_duplicates().sort_values())
    if len(timestamps) < 24:
        raise ValueError("Adaptação residual exige ao menos 24 horas distintas.")
    boundary = max(1, min(len(timestamps) - 1, int(len(timestamps) * train_fraction)))
    validation_times = timestamps[boundary:]
    validation_start = pd.Timestamp(validation_times.min())
    train_cutoff = pd.Timestamp(
        validation_start.value - gap_hours * 3_600_000_000_000,
        tz="UTC",
    )
    train = frame.loc[frame["timestamp_utc"].lt(train_cutoff)].copy()
    validation = frame.loc[frame["timestamp_utc"].isin(validation_times)].copy()
    if train.empty or validation.empty:
        raise ValueError("Split residual vazio após aplicar o gap temporal.")
    return train, validation, {
        "train": _period(train),
        "validation": _period(validation),
        "gap_hours": gap_hours,
        "purged_hours": int(boundary - train["timestamp_utc"].nunique()),
    }


def _search_residual_stage(
    adaptation: pd.DataFrame,
    prior_column: str,
    config: TrainingConfig,
    candidates: tuple[ResidualCandidate, ...],
    scales: tuple[float, ...],
    *,
    train_fraction: float,
    gap_hours: int,
) -> tuple[dict[str, Any], lgb.LGBMRegressor | None, float]:
    train, validation, split = _chronological_adaptation_split(
        adaptation, train_fraction=train_fraction, gap_hours=gap_hours
    )
    target_column = "_stage_residual_cf"
    train[target_column] = (
        train["target_mw"] - train[prior_column]
    ) / train["capacidade_instalada_mw"]
    results: list[dict[str, Any]] = []
    prior_wape = _hourly_metrics(validation, prior_column)["wape"]
    results.append({
        "candidate_id": "no_additional_correction",
        "scale": 0.0,
        "hourly_wape": prior_wape,
        "plant_hour_wape": _prediction_metrics(validation, prior_column)["wape"],
        "parameters": None,
    })
    for candidate in candidates:
        model = _residual_model(candidate, config)
        model.fit(train[FEATURE_COLUMNS], train[target_column])
        correction_cf = model.predict(validation[FEATURE_COLUMNS])
        for scale in scales:
            prediction = _bounded_addition(
                validation, validation[prior_column], correction_cf, scale, config
            )
            scored = validation.assign(_candidate_mw=prediction)
            results.append({
                "candidate_id": candidate.candidate_id,
                "scale": scale,
                "hourly_wape": _hourly_metrics(scored, "_candidate_mw")["wape"],
                "plant_hour_wape": _prediction_metrics(scored, "_candidate_mw")["wape"],
                "parameters": asdict(candidate),
            })
    ranked = sorted(
        results,
        key=lambda item: (
            float("inf") if item["hourly_wape"] is None else item["hourly_wape"],
            float("inf") if item["plant_hour_wape"] is None else item["plant_hour_wape"],
            item["candidate_id"],
            item["scale"],
        ),
    )
    selected = ranked[0]
    selected_model: lgb.LGBMRegressor | None = None
    if selected["scale"] > 0:
        chosen = next(c for c in candidates if c.candidate_id == selected["candidate_id"])
        adaptation = adaptation.copy()
        adaptation[target_column] = (
            adaptation["target_mw"] - adaptation[prior_column]
        ) / adaptation["capacidade_instalada_mw"]
        selected_model = _residual_model(chosen, config)
        selected_model.fit(adaptation[FEATURE_COLUMNS], adaptation[target_column])
    report = {
        "split": split,
        "selection_metric": "aggregate_hourly_wape",
        "tie_breakers": ["plant_hour_wape", "candidate_id", "scale"],
        "prior_validation_hourly_wape": prior_wape,
        "selected": selected,
        "validation_gain_fraction": (
            None if prior_wape in (None, 0)
            else (prior_wape - selected["hourly_wape"]) / prior_wape
        ),
        "candidates_ranked": ranked,
        "refit_on_full_adaptation_month": selected_model is not None,
    }
    return report, selected_model, float(selected["scale"])


def _apply_stage(
    frame: pd.DataFrame,
    prior_column: str,
    output_column: str,
    model: lgb.LGBMRegressor | None,
    scale: float,
    config: TrainingConfig,
) -> None:
    if model is None or scale == 0:
        frame[output_column] = frame[prior_column].to_numpy(dtype=float)
        return
    frame[output_column] = _bounded_addition(
        frame, frame[prior_column], model.predict(frame[FEATURE_COLUMNS]), scale, config
    )


def _calibrated_prediction(
    frame: pd.DataFrame, prior_column: str, factor: float
) -> np.ndarray:
    """Apply a low-variance multiplicative calibration within existing bounds."""
    upper = (
        frame["capacidade_instalada_mw"].to_numpy(dtype=float)
        * frame["disponibilidade"].to_numpy(dtype=float)
    )
    return np.clip(frame[prior_column].to_numpy(dtype=float) * factor, 0.0, upper)


def _search_scalar_calibration(
    adaptation: pd.DataFrame,
    prior_column: str,
    factors: tuple[float, ...],
) -> dict[str, Any]:
    """Select one network-level factor on an already exposed adaptation month."""
    scored: list[dict[str, Any]] = []
    for factor in factors:
        candidate = adaptation.assign(
            _calibrated_mw=_calibrated_prediction(adaptation, prior_column, factor)
        )
        scored.append({
            "factor": factor,
            "hourly_wape": _hourly_metrics(candidate, "_calibrated_mw")["wape"],
            "plant_hour_wape": _prediction_metrics(candidate, "_calibrated_mw")["wape"],
        })
    ranked = sorted(scored, key=lambda item: (
        item["hourly_wape"],
        abs(item["factor"] - 1.0),
        item["plant_hour_wape"],
        item["factor"],
    ))
    prior = _hourly_metrics(adaptation, prior_column)["wape"]
    selected = ranked[0]
    return {
        "adaptation_population": _period(adaptation),
        "selection_metric": "aggregate_hourly_wape",
        "model_complexity": "one multiplicative network-level factor",
        "prior_hourly_wape": prior,
        "selected": selected,
        "adaptation_gain_fraction": None if prior in (None, 0) else (
            prior - selected["hourly_wape"]
        ) / prior,
        "candidates_ranked": ranked,
    }


def _apply_scalar_stage(
    frame: pd.DataFrame,
    prior_column: str,
    output_column: str,
    factor: float,
) -> None:
    frame[output_column] = _calibrated_prediction(frame, prior_column, factor)


def _paired_day_bootstrap(
    frame: pd.DataFrame,
    before_column: str,
    after_column: str,
    *,
    samples: int,
    random_state: int,
) -> dict[str, Any]:
    hourly = frame.groupby("timestamp_utc", as_index=False).agg(
        target_mw=("target_mw", "sum"),
        before_mw=(before_column, "sum"),
        after_mw=(after_column, "sum"),
    )
    hourly["day"] = pd.to_datetime(hourly["timestamp_utc"], utc=True).dt.floor("D")
    days = hourly["day"].drop_duplicates().to_numpy()
    denominator = np.abs(hourly["target_mw"]).sum()
    before_wape = float(np.abs(hourly["before_mw"] - hourly["target_mw"]).sum() / denominator)
    after_wape = float(np.abs(hourly["after_mw"] - hourly["target_mw"]).sum() / denominator)
    rng = np.random.default_rng(random_state)
    improvements = np.empty(samples, dtype=float)
    groups = {day: group for day, group in hourly.groupby("day")}
    for index in range(samples):
        sampled_days = rng.choice(days, size=len(days), replace=True)
        sampled = pd.concat([groups[day] for day in sampled_days], ignore_index=True)
        sampled_denominator = np.abs(sampled["target_mw"]).sum()
        sampled_before = np.abs(sampled["before_mw"] - sampled["target_mw"]).sum()
        sampled_after = np.abs(sampled["after_mw"] - sampled["target_mw"]).sum()
        improvements[index] = (sampled_before - sampled_after) / sampled_denominator
    low, high = np.quantile(improvements, [0.025, 0.975])
    point = before_wape - after_wape
    return {
        "method": "paired UTC-day block bootstrap",
        "samples": samples,
        "days": int(len(days)),
        "random_state": random_state,
        "before_wape": before_wape,
        "after_wape": after_wape,
        "improvement_percentage_points": point * 100,
        "relative_improvement_fraction": None if before_wape == 0 else point / before_wape,
        "confidence_interval_95_percentage_points": [float(low * 100), float(high * 100)],
        "statistically_supported_improvement": bool(low > 0),
    }


def _validate_sequence(named_frames: list[tuple[str, pd.DataFrame]]) -> None:
    previous_end: pd.Timestamp | None = None
    seen_keys: set[tuple[str, int]] = set()
    for name, frame in named_frames:
        if frame.empty:
            raise ValueError(f"Período {name} vazio.")
        keys = set(zip(
            frame["usina_id"].astype(str),
            pd.to_datetime(frame["timestamp_utc"], utc=True).astype("int64"),
        ))
        if seen_keys & keys:
            raise ValueError("Períodos possuem chaves usina-hora sobrepostas.")
        seen_keys |= keys
        start = frame["timestamp_utc"].min()
        end = frame["timestamp_utc"].max()
        if previous_end is not None and start <= previous_end:
            raise ValueError("Períodos devem estar em ordem temporal estrita.")
        previous_end = end


def _comparison_hash(frame: pd.DataFrame, columns: list[str]) -> str:
    stable = frame.sort_values(["timestamp_utc", "usina_id"])[columns]
    return hashlib.sha256(
        stable.to_csv(index=False, float_format="%.9g", lineterminator="\n").encode()
    ).hexdigest()


def run_iterative_residual(
    development: pd.DataFrame,
    september: pd.DataFrame,
    january: pd.DataFrame,
    april: pd.DataFrame,
    config: TrainingConfig,
    spec: CausalEstimandSpec,
    *,
    candidates: tuple[ResidualCandidate, ...] = DEFAULT_CANDIDATES,
    scales: tuple[float, ...] = DEFAULT_SCALES,
    calibration_factors: tuple[float, ...] = DEFAULT_CALIBRATION_FACTORS,
    train_fraction: float = 0.70,
    gap_hours: int = 6,
    bootstrap_samples: int = 2000,
    nuisance_config: NuisanceConfig | None = None,
) -> tuple[dict[str, Any], pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    """Fit sequential corrections and evaluate January and April checkpoints."""
    if config.scientific_target_column() != "geracao_referencia_mw":
        raise ValueError("Experimento iterativo exige geracao_referencia_mw.")
    if not candidates or not scales or any(scale <= 0 or scale > 1 for scale in scales):
        raise ValueError("Busca residual exige candidatos e escalas em (0, 1].")
    if (
        not calibration_factors
        or any(not np.isfinite(factor) or factor <= 0 for factor in calibration_factors)
    ):
        raise ValueError("Fatores de calibração devem ser positivos e finitos.")
    if not 0.5 <= train_fraction < 1:
        raise ValueError("train_fraction deve estar entre 0.5 e 1.")
    if gap_hours < 0 or bootstrap_samples < 100:
        raise ValueError("Gap ou número de amostras bootstrap inválido.")
    spec.validate_feature_config(config.features)

    raw_frames = []
    for name, supplied in (
        ("development_august_2024", development),
        ("adaptation_september_2024", september),
        ("checkpoint_january_2026", january),
        ("checkpoint_april_2026", april),
    ):
        frame = supplied.copy()
        frame["timestamp_utc"] = pd.to_datetime(frame["timestamp_utc"], utc=True)
        frame["usina_id"] = frame["usina_id"].astype(str)
        if frame.duplicated(["usina_id", "timestamp_utc"]).any():
            raise ValueError(f"{name} contém chaves usina-hora duplicadas.")
        raw_frames.append((name, frame))
    _validate_sequence(raw_frames)
    prepared = {
        name: _prepared(frame, config.scientific_target_column(), config)
        for name, frame in raw_frames
    }
    development_p = prepared["development_august_2024"]
    september_p = prepared["adaptation_september_2024"]
    january_p = prepared["checkpoint_january_2026"]
    april_p = prepared["checkpoint_april_2026"]

    base_model = _base_lightgbm(config)
    base_model.fit(development_p[FEATURE_COLUMNS], development_p["residual_cf"])
    nuisance = nuisance_config or NuisanceConfig(
        random_state=config.random_state, n_jobs=config.n_jobs
    )
    dml = fit_dml_plr(development_p, spec, nuisance, feature_config=config.features)

    for frame in (september_p, january_p, april_p):
        base_cf = base_model.predict(frame[FEATURE_COLUMNS])
        frame["lightgbm_aug_mw"] = _bounded_addition(
            frame, frame["baseline_mw"], base_cf, 1.0, config
        )
        known = frame["usina_id"].isin(set(dml.plant_ids))
        frame["dml_aug_mw"] = frame["baseline_mw"].to_numpy(dtype=float)
        if known.any():
            candidate = frame.loc[known]
            dml_cf = dml.predict_residual_cf(candidate)
            frame.loc[known, "dml_aug_mw"] = _bounded_addition(
                candidate, candidate["baseline_mw"], dml_cf, 1.0, config
            )
        frame["dml_known_plant"] = known.astype("int8")

    september_search, september_model, september_scale = _search_residual_stage(
        september_p,
        "lightgbm_aug_mw",
        config,
        candidates,
        scales,
        train_fraction=train_fraction,
        gap_hours=gap_hours,
    )
    for frame in (january_p, april_p):
        _apply_stage(
            frame,
            "lightgbm_aug_mw",
            "lightgbm_aug_sep_mw",
            september_model,
            september_scale,
            config,
        )
    september_scalar = _search_scalar_calibration(
        september_p, "lightgbm_aug_mw", calibration_factors
    )
    september_factor = float(september_scalar["selected"]["factor"])
    for frame in (january_p, april_p):
        _apply_scalar_stage(
            frame,
            "lightgbm_aug_mw",
            "lightgbm_aug_sep_scalar_mw",
            september_factor,
        )

    # January is measured here while fully frozen. Only after these predictions
    # exist does it become the adaptation month for the second correction.
    january_frozen_metrics = _metrics(january_p, {
        "physical": "baseline_mw",
        "lightgbm_aug": "lightgbm_aug_mw",
        "dml_aug": "dml_aug_mw",
        "lightgbm_aug_plus_sep_residual": "lightgbm_aug_sep_mw",
        "lightgbm_aug_plus_sep_scalar": "lightgbm_aug_sep_scalar_mw",
    })
    january_search, january_model, january_scale = _search_residual_stage(
        january_p,
        "lightgbm_aug_sep_mw",
        config,
        candidates,
        scales,
        train_fraction=train_fraction,
        gap_hours=gap_hours,
    )
    january_scalar = _search_scalar_calibration(
        january_p, "lightgbm_aug_sep_scalar_mw", calibration_factors
    )
    january_factor = float(january_scalar["selected"]["factor"])
    _apply_stage(
        april_p,
        "lightgbm_aug_sep_mw",
        "lightgbm_aug_sep_jan_mw",
        january_model,
        january_scale,
        config,
    )
    _apply_scalar_stage(
        april_p,
        "lightgbm_aug_sep_scalar_mw",
        "lightgbm_aug_sep_jan_scalar_mw",
        january_factor,
    )
    april_frozen_metrics = _metrics(april_p, {
        "physical": "baseline_mw",
        "lightgbm_aug": "lightgbm_aug_mw",
        "dml_aug": "dml_aug_mw",
        "lightgbm_aug_plus_sep_residual": "lightgbm_aug_sep_mw",
        "lightgbm_aug_plus_sep_and_jan_residuals": "lightgbm_aug_sep_jan_mw",
        "lightgbm_aug_plus_sep_scalar": "lightgbm_aug_sep_scalar_mw",
        "lightgbm_aug_plus_sep_and_jan_scalars": "lightgbm_aug_sep_jan_scalar_mw",
    })

    january_significance = _paired_day_bootstrap(
        january_p,
        "lightgbm_aug_mw",
        "lightgbm_aug_sep_mw",
        samples=bootstrap_samples,
        random_state=config.random_state,
    )
    april_significance = _paired_day_bootstrap(
        april_p,
        "lightgbm_aug_sep_mw",
        "lightgbm_aug_sep_jan_mw",
        samples=bootstrap_samples,
        random_state=config.random_state + 1,
    )
    january_scalar_significance = _paired_day_bootstrap(
        january_p,
        "lightgbm_aug_mw",
        "lightgbm_aug_sep_scalar_mw",
        samples=bootstrap_samples,
        random_state=config.random_state + 2,
    )
    april_september_scalar_significance = _paired_day_bootstrap(
        april_p,
        "lightgbm_aug_mw",
        "lightgbm_aug_sep_scalar_mw",
        samples=bootstrap_samples,
        random_state=config.random_state + 3,
    )
    april_january_scalar_significance = _paired_day_bootstrap(
        april_p,
        "lightgbm_aug_sep_scalar_mw",
        "lightgbm_aug_sep_jan_scalar_mw",
        samples=bootstrap_samples,
        random_state=config.random_state + 4,
    )
    january_p["reference_within_available_capacity"] = (
        january_p["target_mw"]
        <= january_p["capacidade_instalada_mw"] * january_p["disponibilidade"] + 1e-9
    ).astype("int8")
    april_p["reference_within_available_capacity"] = (
        april_p["target_mw"]
        <= april_p["capacidade_instalada_mw"] * april_p["disponibilidade"] + 1e-9
    ).astype("int8")

    prediction_base_columns = [
        "timestamp_utc", "usina_id", "target_mw", "capacidade_instalada_mw",
        "disponibilidade", "wind_speed_100m", "wind_speed_hub_m",
        "air_density_kg_m3", "baseline_mw", "lightgbm_aug_mw", "dml_aug_mw",
        "dml_known_plant", "reference_within_available_capacity",
    ]
    january_predictions = january_p[prediction_base_columns + [
        "lightgbm_aug_sep_mw", "lightgbm_aug_sep_scalar_mw"
    ]].sort_values(["timestamp_utc", "usina_id"]).reset_index(drop=True)
    april_predictions = april_p[prediction_base_columns + [
        "lightgbm_aug_sep_mw", "lightgbm_aug_sep_jan_mw",
        "lightgbm_aug_sep_scalar_mw", "lightgbm_aug_sep_jan_scalar_mw",
    ]].sort_values(["timestamp_utc", "usina_id"]).reset_index(drop=True)

    april_wapes = {
        name: values["hourly_total"]["wape"]
        for name, values in april_frozen_metrics.items()
    }
    best_april_candidate = min(april_wapes, key=april_wapes.get)

    report = {
        "schema_version": SCHEMA_VERSION,
        "status": "exploratory_sequential_month_checkpoints_complete",
        "scientifically_approved": False,
        "target": "geracao_referencia_mw",
        "primary_metric": "aggregate_hourly_wape",
        "sequence": {
            name: _period(frame) for name, frame in raw_frames
        },
        "separation": {
            "strategy": "sequential_residual_adaptation_with_later_frozen_checkpoints",
            "development": "August 2024",
            "first_adaptation": "September 2024",
            "september_role_change": (
                "Previously consumed independent holdout; explicitly reclassified as exposed "
                "adaptation data before January was opened."
            ),
            "first_checkpoint_before_exposure": "January 2026",
            "second_adaptation_after_checkpoint": "January 2026",
            "final_untouched_checkpoint": "April 2026",
            "april_used_for_training_or_selection": False,
            "target_used_for_features": False,
            "gap_hours_inside_adaptation_months": gap_hours,
        },
        "search_space": {
            "candidates": [asdict(candidate) for candidate in candidates],
            "scales": list(scales),
            "calibration_factors": list(calibration_factors),
            "includes_noop_guardrail": True,
            "feature_order_sha256": sha256_json(FEATURE_COLUMNS),
        },
        "adaptation": {
            "september": september_search,
            "january_after_frozen_evaluation": january_search,
            "september_low_variance_scalar": september_scalar,
            "january_low_variance_scalar_after_frozen_evaluation": january_scalar,
        },
        "checkpoints": {
            "january_2026": {
                "metrics_primary_all_physically_valid": january_frozen_metrics,
                "september_residual_vs_aug_lightgbm": january_significance,
                "september_scalar_vs_aug_lightgbm": january_scalar_significance,
                "dml_known_plant_rows": int(january_p["dml_known_plant"].sum()),
                "dml_fallback_rows": int(january_p["dml_known_plant"].eq(0).sum()),
                "reference_above_available_rows": int(
                    january_p["reference_within_available_capacity"].eq(0).sum()
                ),
            },
            "april_2026": {
                "metrics_primary_all_physically_valid": april_frozen_metrics,
                "january_residual_vs_previous_stage": april_significance,
                "september_scalar_vs_aug_lightgbm": april_september_scalar_significance,
                "january_scalar_vs_september_scalar": april_january_scalar_significance,
                "dml_known_plant_rows": int(april_p["dml_known_plant"].sum()),
                "dml_fallback_rows": int(april_p["dml_known_plant"].eq(0).sum()),
                "reference_above_available_rows": int(
                    april_p["reference_within_available_capacity"].eq(0).sum()
                ),
            },
        },
        "annual_test_readiness": {
            "best_april_candidate": best_april_candidate,
            "best_april_hourly_wape": april_wapes[best_april_candidate],
            "recommended_frozen_candidate": (
                "lightgbm_aug_plus_sep_scalar"
                if best_april_candidate == "lightgbm_aug_plus_sep_scalar"
                else best_april_candidate
            ),
            "do_not_carry_forward": [
                "lightgbm_aug_plus_sep_and_jan_residuals",
                "lightgbm_aug_plus_sep_and_jan_scalars",
            ],
            "next_period_must_remain_untouched": True,
        },
        "config": config.serializable(),
        "estimand": spec.serializable(),
        "estimand_sha256": spec.digest(),
        "nuisance_config": asdict(nuisance),
        "limitations": [
            "ERA5 reanalysis measures historical weather and does not include future forecast error.",
            "January is an external checkpoint only for the September correction; it is exposed afterwards for stage two.",
            "April is the final untouched checkpoint in this round and must not be used for retuning.",
            "Statistical support uses paired UTC-day block bootstrap; business materiality still needs a domain threshold.",
            "The target-based availability cohort is diagnostic only and never filters the primary result.",
        ],
    }
    report["comparison_sha256"] = {
        "january": _comparison_hash(january_predictions, list(january_predictions.columns)),
        "april": _comparison_hash(april_predictions, list(april_predictions.columns)),
    }
    models = {
        "base_lightgbm": base_model,
        "base_dml": dml,
        "september_residual": september_model,
        "january_residual": january_model,
        "september_scale": september_scale,
        "january_scale": january_scale,
        "september_calibration_factor": september_factor,
        "january_calibration_factor": january_factor,
    }
    return report, january_predictions, april_predictions, models


def _load_search_space(
    path: Path | None,
) -> tuple[tuple[ResidualCandidate, ...], tuple[float, ...], tuple[float, ...]]:
    if path is None:
        return DEFAULT_CANDIDATES, DEFAULT_SCALES, DEFAULT_CALIBRATION_FACTORS
    values = json.loads(path.read_text(encoding="utf-8"))
    candidates = tuple(ResidualCandidate.from_dict(item) for item in values["candidates"])
    scales = tuple(float(value) for value in values["scales"])
    calibration = values.get("calibration_factor_grid", {})
    if calibration:
        start = float(calibration["start"])
        stop = float(calibration["stop"])
        step = float(calibration["step"])
        calibration_factors = tuple(float(value) for value in np.round(
            np.arange(start, stop + step / 2, step), 10
        ))
    else:
        calibration_factors = DEFAULT_CALIBRATION_FACTORS
    return candidates, scales, calibration_factors


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Adapta correções residuais em setembro/janeiro e testa janeiro/abril."
    )
    parser.add_argument("--development", required=True, type=Path)
    parser.add_argument("--september", required=True, type=Path)
    parser.add_argument("--january", required=True, type=Path)
    parser.add_argument("--april", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--estimand", required=True, type=Path)
    parser.add_argument("--search-space", type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--gap-hours", type=int, default=6)
    parser.add_argument("--bootstrap-samples", type=int, default=2000)
    args = parser.parse_args()
    if args.output_dir.exists():
        raise FileExistsError("Diretório de saída já existe; checkpoints não podem ser sobrescritos.")
    args.output_dir.mkdir(parents=True)
    input_paths = {
        "development": args.development,
        "september": args.september,
        "january": args.january,
        "april": args.april,
        "config": args.config,
        "estimand": args.estimand,
    }
    if args.search_space:
        input_paths["search_space"] = args.search_space
    access_receipt_path = args.output_dir / "checkpoint_access_receipt.json"
    atomic_write_json(access_receipt_path, {
        "schema_version": "climagrid-sequential-checkpoint-access-v1",
        "accessed_at_utc": utc_now_iso(),
        "inputs": {
            name: {"path": str(path), "sha256": sha256_file(path)}
            for name, path in input_paths.items()
        },
        "april_purpose": "single untouched final checkpoint; never parameter selection",
    })
    config = load_config(args.config)
    snapshots: dict[str, pd.DataFrame] = {}
    validations: dict[str, Any] = {}
    for name, path in (
        ("development", args.development),
        ("september", args.september),
        ("january", args.january),
        ("april", args.april),
    ):
        snapshots[name], validations[name] = prepare_snapshot(read_tabular(path), config)
    candidates, scales, calibration_factors = _load_search_space(args.search_space)
    report, january_predictions, april_predictions, models = run_iterative_residual(
        snapshots["development"],
        snapshots["september"],
        snapshots["january"],
        snapshots["april"],
        config,
        CausalEstimandSpec.load(args.estimand),
        candidates=candidates,
        scales=scales,
        calibration_factors=calibration_factors,
        gap_hours=args.gap_hours,
        bootstrap_samples=args.bootstrap_samples,
    )
    january_path = args.output_dir / "january_2026_predictions.parquet"
    april_path = args.output_dir / "april_2026_predictions.parquet"
    atomic_write_parquet(january_predictions, january_path)
    atomic_write_parquet(april_predictions, april_path)
    model_outputs: dict[str, Any] = {}
    for name in ("base_lightgbm", "september_residual", "january_residual"):
        model = models[name]
        if model is None:
            model_outputs[name] = {"selected": False}
            continue
        path = args.output_dir / f"{name}.txt"
        model.booster_.save_model(str(path))
        model_outputs[name] = {"selected": True, "path": str(path), "sha256": sha256_file(path)}
    dml_metadata = models["base_dml"].save(
        args.output_dir / "base_dml_bundle",
        provenance={"scope": "sequential_residual_comparator", "development": str(args.development)},
    )
    report.update({
        "inputs": {
            name: {"path": str(path), "sha256": sha256_file(path)}
            for name, path in input_paths.items()
        },
        "outputs": {
            "january_predictions_sha256": sha256_file(january_path),
            "april_predictions_sha256": sha256_file(april_path),
            "base_dml_metadata_sha256": sha256_json(dml_metadata),
            "checkpoint_access_receipt_sha256": sha256_file(access_receipt_path),
            "models": model_outputs,
        },
        "validation": validations,
    })
    report_path = args.output_dir / "iterative_report.json"
    atomic_write_json(report_path, report)
    print(json.dumps({
        "status": report["status"],
        "report": str(report_path),
        "january_hourly": {
            name: values["hourly_total"]["wape"]
            for name, values in report["checkpoints"]["january_2026"][
                "metrics_primary_all_physically_valid"
            ].items()
        },
        "april_hourly": {
            name: values["hourly_total"]["wape"]
            for name, values in report["checkpoints"]["april_2026"][
                "metrics_primary_all_physically_valid"
            ].items()
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
