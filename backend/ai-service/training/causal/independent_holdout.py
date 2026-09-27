"""Evaluate frozen model choices on a later, independent monthly holdout.

This job is deliberately separate from the hackathon walk-forward comparison:
the development and holdout snapshots are different files, the holdout must be
strictly later, and target-based eligibility is reported only as a secondary
cohort.  The primary metrics always cover every physically valid holdout row.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict
import hashlib
import json
from pathlib import Path

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
from training.causal.dml_plr import NuisanceConfig, eligible_causal_rows, fit_dml_plr
from training.causal.hackathon import _fixed_residual_model
from training.causal.spec import CausalEstimandSpec
from training.config import TrainingConfig, load_config
from training.evaluate import regression_metrics
from training.features import FEATURE_COLUMNS
from training.physical_curve import apply_physical_bounds
from training.protocol import sha256_json
from training.train import _prepared


SCHEMA_VERSION = "climagrid-independent-month-holdout-v1"


def _period(frame: pd.DataFrame) -> dict[str, str | int]:
    timestamps = pd.to_datetime(frame["timestamp_utc"], utc=True)
    return {
        "start_utc": timestamps.min().isoformat(),
        "end_utc": timestamps.max().isoformat(),
        "rows": int(len(frame)),
        "hours": int(timestamps.nunique()),
        "plants": int(frame["usina_id"].nunique()),
    }


def _prediction_metrics(frame: pd.DataFrame, column: str) -> dict:
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


def _hourly_metrics(frame: pd.DataFrame, column: str) -> dict:
    hourly = frame.groupby("timestamp_utc", as_index=False).agg(
        target_mw=("target_mw", "sum"),
        prediction_mw=(column, "sum"),
        capacidade_instalada_mw=("capacidade_instalada_mw", "sum"),
    )
    return _prediction_metrics(hourly, "prediction_mw")


def _model_metrics(frame: pd.DataFrame) -> dict:
    if frame.empty:
        return {"rows": 0, "hours": 0, "plants": 0, "models": {}}
    return {
        "rows": int(len(frame)),
        "hours": int(frame["timestamp_utc"].nunique()),
        "plants": int(frame["usina_id"].nunique()),
        "models": {
            name: {
                "plant_hour": _prediction_metrics(frame, column),
                "hourly_total": _hourly_metrics(frame, column),
            }
            for name, column in {
                "physical": "baseline_mw",
                "lightgbm": "lightgbm_mw",
                "dml_operational": "dml_mw",
            }.items()
        },
    }


def _comparison_hash(frame: pd.DataFrame) -> str:
    columns = [
        "timestamp_utc", "usina_id", "target_mw", "baseline_mw",
        "lightgbm_mw", "dml_mw", "dml_model_eligible", "fallback_reason",
        "reference_within_available_capacity",
    ]
    stable = frame.sort_values(["timestamp_utc", "usina_id"])[columns]
    return hashlib.sha256(
        stable.to_csv(index=False, float_format="%.9g", lineterminator="\n").encode()
    ).hexdigest()


def run_independent_holdout(
    development: pd.DataFrame,
    holdout: pd.DataFrame,
    config: TrainingConfig,
    spec: CausalEstimandSpec,
    *,
    gap_hours: int = 6,
    nuisance_config: NuisanceConfig | None = None,
) -> tuple[dict, pd.DataFrame, object, object]:
    """Train only on development and evaluate once on a later holdout."""
    if gap_hours < 0:
        raise ValueError("gap_hours deve ser não negativo.")
    if config.scientific_target_column() != "geracao_referencia_mw":
        raise ValueError("Holdout independente exige geracao_referencia_mw.")
    if spec.status not in {"infrastructure_test", "exploratory"}:
        raise ValueError("Este job exploratório não consome teste final homologado.")
    spec.validate_feature_config(config.features)

    development = development.copy()
    holdout = holdout.copy()
    for frame in (development, holdout):
        frame["timestamp_utc"] = pd.to_datetime(frame["timestamp_utc"], utc=True)
        frame["usina_id"] = frame["usina_id"].astype(str)
    keys = ["usina_id", "timestamp_utc"]
    if development.duplicated(keys).any() or holdout.duplicated(keys).any():
        raise ValueError("Development e holdout exigem chaves usina-hora únicas.")
    overlap = development[keys].merge(holdout[keys], on=keys, how="inner")
    if len(overlap):
        raise ValueError("Development e holdout possuem linhas sobrepostas.")
    development_end = development["timestamp_utc"].max()
    holdout_start = holdout["timestamp_utc"].min()
    if holdout_start <= development_end:
        raise ValueError("Holdout deve começar estritamente depois do development.")
    cutoff = holdout_start - pd.Timedelta(int(gap_hours), unit="h")
    if gap_hours:
        development_used = development.loc[development["timestamp_utc"].lt(cutoff)].copy()
    else:
        development_used = development.copy()
    if development_used.empty:
        raise ValueError("Gap temporal removeu todo o development.")
    purged_keys = pd.MultiIndex.from_frame(
        development.loc[~development.index.isin(development_used.index), keys]
    )

    # Feature creation uses only deterministic climate/calendar transforms and
    # backward-looking lags. Concatenation preserves valid context at the month
    # boundary without fitting anything on holdout labels.
    development_context = development.copy()
    development_context["_partition"] = np.where(
        pd.MultiIndex.from_frame(development_context[keys]).isin(purged_keys),
        "purged_context", "development",
    )
    combined = pd.concat([
        development_context,
        holdout.assign(_partition="holdout"),
    ], ignore_index=True).sort_values(["timestamp_utc", "usina_id"])
    prepared = _prepared(combined, config.scientific_target_column(), config)
    train = prepared.loc[prepared["_partition"].eq("development")].copy()
    evaluation = prepared.loc[prepared["_partition"].eq("holdout")].copy()

    nuisance = nuisance_config or NuisanceConfig(
        random_state=config.random_state, n_jobs=config.n_jobs,
    )
    dml = fit_dml_plr(
        eligible_causal_rows(train, config.features), spec, nuisance,
        feature_config=config.features,
    )
    lightgbm = _fixed_residual_model(config)
    lightgbm.fit(train[FEATURE_COLUMNS], train["residual_cf"])
    lightgbm_correction = (
        lightgbm.predict(evaluation[FEATURE_COLUMNS])
        * evaluation["capacidade_instalada_mw"].to_numpy()
    )
    evaluation["lightgbm_mw"] = apply_physical_bounds(
        evaluation["baseline_mw"], lightgbm_correction,
        evaluation["wind_speed_hub_m"], evaluation["capacidade_instalada_mw"],
        evaluation["disponibilidade"], config.physical_curve,
    )

    known_plants = set(dml.plant_ids)
    known = evaluation["usina_id"].isin(known_plants)
    if config.features.require_complete_history:
        context = evaluation["temporal_context_complete"].eq(1)
    else:
        context = pd.Series(True, index=evaluation.index)
    dml_eligible = known & context
    evaluation["dml_mw"] = evaluation["baseline_mw"]
    if dml_eligible.any():
        candidate = evaluation.loc[dml_eligible].copy()
        dml_correction = (
            dml.predict_residual_cf(candidate)
            * candidate["capacidade_instalada_mw"].to_numpy()
        )
        evaluation.loc[dml_eligible, "dml_mw"] = apply_physical_bounds(
            candidate["baseline_mw"], dml_correction,
            candidate["wind_speed_hub_m"], candidate["capacidade_instalada_mw"],
            candidate["disponibilidade"], config.physical_curve,
        )
    evaluation["dml_model_eligible"] = dml_eligible.astype("int8")
    evaluation["fallback_reason"] = np.select(
        [~known, known & ~context],
        ["unknown_plant", "incomplete_temporal_context"],
        default="none",
    )
    available_capacity = (
        evaluation["capacidade_instalada_mw"] * evaluation["disponibilidade"]
    )
    evaluation["reference_within_available_capacity"] = (
        evaluation["target_mw"] <= available_capacity + 1e-9
    ).astype("int8")

    primary = evaluation.copy()
    secondary = evaluation.loc[
        evaluation["reference_within_available_capacity"].eq(1)
    ].copy()
    paired = evaluation.loc[evaluation["dml_model_eligible"].eq(1)].copy()
    report = {
        "schema_version": SCHEMA_VERSION,
        "status": "exploratory_independent_holdout_consumed",
        "scientifically_approved": False,
        "target": "geracao_referencia_mw",
        "message": (
            "O holdout é temporalmente separado, mas permanece exploratório até haver "
            "histórico multiestação, contrato do alvo e critérios aprovados."
        ),
        "separation": {
            "strategy": "separate_later_snapshot_no_refit",
            "gap_hours": gap_hours,
            "development_supplied": _period(development),
            "development_used": _period(development_used),
            "purged_development_rows": int(len(development) - len(development_used)),
            "holdout": _period(holdout),
            "overlapping_keys": 0,
            "holdout_used_for_training": False,
            "target_used_for_feature_engineering": False,
        },
        "coverage": {
            "holdout_rows": int(len(evaluation)),
            "dml_model_rows": int(dml_eligible.sum()),
            "fallback_rows": int((~dml_eligible).sum()),
            "fallback_unknown_plant_rows": int((~known).sum()),
            "fallback_incomplete_context_rows": int((known & ~context).sum()),
            "reference_within_available_rows": int(len(secondary)),
            "reference_above_available_rows": int(len(evaluation) - len(secondary)),
        },
        "metrics": {
            "primary_all_physically_valid_holdout": _model_metrics(primary),
            "secondary_reference_within_available": _model_metrics(secondary),
            "paired_dml_eligible": _model_metrics(paired),
        },
        "config": config.serializable(),
        "estimand": spec.serializable(),
        "estimand_sha256": spec.digest(),
        "nuisance_config": asdict(nuisance),
        "feature_order_sha256": sha256_json(FEATURE_COLUMNS),
        "limitations": [
            "ERA5 reanalysis does not include future weather-forecast error.",
            "Unknown plants use the physical fallback and are reported separately.",
            "The target-based availability cohort is secondary and never replaces the primary holdout.",
        ],
    }
    columns = [
        "timestamp_utc", "usina_id", "target_mw", "capacidade_instalada_mw",
        "disponibilidade", "wind_speed_100m", "wind_speed_hub_m",
        "air_density_kg_m3", "baseline_mw", "lightgbm_mw", "dml_mw",
        "dml_model_eligible", "fallback_reason",
        "reference_within_available_capacity", "temporal_context_complete",
        "most_applied",
    ]
    predictions = evaluation[columns].sort_values(
        ["timestamp_utc", "usina_id"]
    ).reset_index(drop=True)
    report["comparison_sha256"] = _comparison_hash(predictions)
    return report, predictions, dml, lightgbm


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Treina no development e consome uma única vez um holdout mensal posterior."
    )
    parser.add_argument("--development", required=True, type=Path)
    parser.add_argument("--holdout", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--estimand", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--gap-hours", type=int, default=6)
    args = parser.parse_args()
    if args.output_dir.exists():
        raise FileExistsError("Diretório de saída já existe; o holdout não pode ser sobrescrito.")
    args.output_dir.mkdir(parents=True)
    access_receipt_path = args.output_dir / "holdout_access_receipt.json"
    atomic_write_json(access_receipt_path, {
        "schema_version": "climagrid-holdout-access-v1",
        "accessed_at_utc": utc_now_iso(),
        "holdout_path": str(args.holdout),
        "holdout_sha256": sha256_file(args.holdout),
        "purpose": "single independent exploratory evaluation",
        "consumed": True,
    })

    config = load_config(args.config)
    development, development_validation = prepare_snapshot(
        read_tabular(args.development), config
    )
    holdout, holdout_validation = prepare_snapshot(read_tabular(args.holdout), config)
    report, predictions, dml, lightgbm = run_independent_holdout(
        development, holdout, config, CausalEstimandSpec.load(args.estimand),
        gap_hours=args.gap_hours,
    )
    predictions_path = args.output_dir / "holdout_predictions.parquet"
    atomic_write_parquet(predictions, predictions_path)
    dml_metadata = dml.save(args.output_dir / "dml_bundle", provenance={
        "scope": "independent_month_holdout",
        "development_sha256": sha256_file(args.development),
        "holdout_sha256": sha256_file(args.holdout),
    })
    lightgbm_path = args.output_dir / "lightgbm_model.txt"
    lightgbm.booster_.save_model(str(lightgbm_path))
    report.update({
        "inputs": {
            "development": {"path": str(args.development), "sha256": sha256_file(args.development)},
            "holdout": {"path": str(args.holdout), "sha256": sha256_file(args.holdout)},
            "config": {"path": str(args.config), "sha256": sha256_file(args.config)},
            "estimand": {"path": str(args.estimand), "sha256": sha256_file(args.estimand)},
        },
        "outputs": {
            "predictions_sha256": sha256_file(predictions_path),
            "dml_metadata_sha256": sha256_json(dml_metadata),
            "lightgbm_model_sha256": sha256_file(lightgbm_path),
            "holdout_access_receipt_sha256": sha256_file(access_receipt_path),
        },
        "validation": {
            "development": development_validation,
            "holdout": holdout_validation,
        },
    })
    report_path = args.output_dir / "holdout_report.json"
    atomic_write_json(report_path, report)
    print(json.dumps({
        "status": report["status"],
        "report": str(report_path),
        "primary_metrics": report["metrics"]["primary_all_physically_valid_holdout"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
