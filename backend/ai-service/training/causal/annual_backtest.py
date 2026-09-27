"""Frozen 12-month backtest focused on grid-planning user metrics.

This evaluator never fits or selects a model.  It consumes the candidate frozen
by ``iterative_residual.py`` and reports both scientific metrics and a compact
traction summary aligned with the product: one PWF represents one hourly grid
state, so aggregate-hour errors are primary and plant-hour errors secondary.
"""
from __future__ import annotations

import argparse
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
from training.causal.dml_plr import DMLPLRModel
from training.causal.iterative_residual import _paired_day_bootstrap
from training.config import TrainingConfig
from training.evaluate import regression_metrics
from training.features import FEATURE_COLUMNS
from training.physical_curve import apply_physical_bounds
from training.train import _prepared


SCHEMA_VERSION = "climagrid-annual-frozen-backtest-v1"


def _periods_are_contiguous(labels: list[str]) -> None:
    try:
        periods = [pd.Period(label, freq="M") for label in labels]
    except ValueError as exc:
        raise ValueError("Rótulos mensais devem usar YYYY-MM.") from exc
    if len(periods) != 12 or len(set(periods)) != 12:
        raise ValueError("Backtest anual exige exatamente 12 meses distintos.")
    ordered = sorted(periods)
    expected = list(pd.period_range(ordered[0], periods=12, freq="M"))
    if ordered != expected or periods != ordered:
        raise ValueError("Os 12 meses devem estar ordenados e ser contíguos.")


def _prediction_metrics(frame: pd.DataFrame, column: str) -> dict[str, Any]:
    result = regression_metrics(
        frame["target_mw"], frame[column], frame["capacidade_instalada_mw"]
    )
    target_total = float(frame["target_mw"].sum())
    prediction_total = float(frame[column].sum())
    result.update({
        "target_total_mwh": target_total,
        "prediction_total_mwh": prediction_total,
        "absolute_total_difference_mwh": abs(prediction_total - target_total),
        "signed_total_difference_mwh": prediction_total - target_total,
        "signed_total_error_fraction": (
            None if target_total == 0 else (prediction_total - target_total) / target_total
        ),
    })
    return result


def _hourly_frame(frame: pd.DataFrame, column: str) -> pd.DataFrame:
    return frame.groupby("timestamp_utc", as_index=False).agg(
        target_mw=("target_mw", "sum"),
        prediction_mw=(column, "sum"),
        capacidade_instalada_mw=("capacidade_instalada_mw", "sum"),
    ).sort_values("timestamp_utc")


def _grid_user_metrics(hourly: pd.DataFrame) -> dict[str, Any]:
    actual = hourly["target_mw"].to_numpy(dtype=float)
    predicted = hourly["prediction_mw"].to_numpy(dtype=float)
    error = predicted - actual
    absolute = np.abs(error)
    valid_percentage = np.abs(actual) > 1e-9
    absolute_percentage = absolute[valid_percentage] / np.abs(actual[valid_percentage])
    denominator = float(np.sum((actual - actual.mean()) ** 2))
    correlation = float(np.corrcoef(actual, predicted)[0, 1]) if (
        len(actual) > 1 and np.std(actual) > 0 and np.std(predicted) > 0
    ) else None
    actual_peak_index = int(np.argmax(actual))
    predicted_peak_index = int(np.argmax(predicted))
    actual_peak = float(actual[actual_peak_index])
    prediction_at_actual_peak = float(predicted[actual_peak_index])
    return {
        "hourly_r2": None if denominator == 0 else float(
            1 - np.sum(error ** 2) / denominator
        ),
        "hourly_correlation": correlation,
        "median_hourly_absolute_percentage_error": (
            None if not len(absolute_percentage) else float(np.median(absolute_percentage))
        ),
        "p90_hourly_absolute_percentage_error": (
            None if not len(absolute_percentage) else float(np.quantile(absolute_percentage, 0.90))
        ),
        "hours_within_5_percent_fraction": float(np.mean(absolute_percentage <= 0.05)),
        "hours_within_10_percent_fraction": float(np.mean(absolute_percentage <= 0.10)),
        "hours_within_15_percent_fraction": float(np.mean(absolute_percentage <= 0.15)),
        "hours_within_20_percent_fraction": float(np.mean(absolute_percentage <= 0.20)),
        "actual_peak_mw": actual_peak,
        "actual_peak_timestamp_utc": pd.Timestamp(
            hourly.iloc[actual_peak_index]["timestamp_utc"]
        ).isoformat(),
        "prediction_at_actual_peak_mw": prediction_at_actual_peak,
        "signed_error_at_actual_peak_fraction": (
            None if actual_peak == 0
            else (prediction_at_actual_peak - actual_peak) / actual_peak
        ),
        "predicted_peak_mw": float(predicted[predicted_peak_index]),
        "predicted_peak_timestamp_utc": pd.Timestamp(
            hourly.iloc[predicted_peak_index]["timestamp_utc"]
        ).isoformat(),
    }


def _model_metrics(frame: pd.DataFrame, column: str) -> dict[str, Any]:
    hourly = _hourly_frame(frame, column)
    hourly_metrics = _prediction_metrics(
        hourly.rename(columns={"prediction_mw": column}), column
    )
    hourly_metrics.update(_grid_user_metrics(hourly))
    return {
        "plant_hour": _prediction_metrics(frame, column),
        "hourly_grid_total": hourly_metrics,
    }


def _monthly_metrics(
    frame: pd.DataFrame, columns: dict[str, str]
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for month, group in frame.groupby("evaluation_month", sort=True):
        row: dict[str, Any] = {
            "month": str(month),
            "rows": int(len(group)),
            "hours": int(group["timestamp_utc"].nunique()),
            "plants": int(group["usina_id"].nunique()),
        }
        for name, column in columns.items():
            metrics = _model_metrics(group, column)["hourly_grid_total"]
            row[name] = {
                "wape": metrics["wape"],
                "mae_mw": metrics["mae_mw"],
                "rmse_mw": metrics["rmse_mw"],
                "target_total_mwh": metrics["target_total_mwh"],
                "prediction_total_mwh": metrics["prediction_total_mwh"],
                "signed_total_error_fraction": metrics["signed_total_error_fraction"],
                "p95_abs_error_mw": metrics["p95_abs_error_mw"],
                "hours_within_10_percent_fraction": metrics[
                    "hours_within_10_percent_fraction"
                ],
            }
        rows.append(row)
    return rows


def _traction_summary(
    overall: dict[str, Any],
    monthly: list[dict[str, Any]],
    significance: dict[str, Any],
) -> dict[str, Any]:
    chosen = overall["lightgbm_aug_plus_sep_scalar"]["hourly_grid_total"]
    chosen_plant = overall["lightgbm_aug_plus_sep_scalar"]["plant_hour"]
    base = overall["lightgbm_aug"]["hourly_grid_total"]
    physical = overall["physical"]["hourly_grid_total"]
    monthly_wapes = [row["lightgbm_aug_plus_sep_scalar"]["wape"] for row in monthly]
    base_wapes = [row["lightgbm_aug"]["wape"] for row in monthly]
    best_index = int(np.argmin(monthly_wapes))
    worst_index = int(np.argmax(monthly_wapes))
    return {
        "candidate": "lightgbm_aug_plus_sep_scalar",
        "audience_note": (
            "Primary metrics aggregate all plants per hour because each user scenario/PWF "
            "represents one grid instant. Plant-hour metrics are diagnostic."
        ),
        "annual_reference_energy_mwh": chosen["target_total_mwh"],
        "annual_predicted_energy_mwh": chosen["prediction_total_mwh"],
        "annual_signed_total_error_fraction": chosen["signed_total_error_fraction"],
        "annual_absolute_total_difference_mwh": chosen["absolute_total_difference_mwh"],
        "hourly_grid_wape": chosen["wape"],
        "wape_proximity_fraction_for_pitch": 1 - chosen["wape"],
        "hourly_grid_mae_mw": chosen["mae_mw"],
        "hourly_grid_rmse_mw": chosen["rmse_mw"],
        "hourly_grid_p95_absolute_error_mw": chosen["p95_abs_error_mw"],
        "plant_hour_wape_for_spatial_injections": chosen_plant["wape"],
        "plant_hour_mae_mw_for_spatial_injections": chosen_plant["mae_mw"],
        "plant_hour_p95_absolute_error_mw": chosen_plant["p95_abs_error_mw"],
        "hourly_r2": chosen["hourly_r2"],
        "hourly_correlation": chosen["hourly_correlation"],
        "hours_within_10_percent_fraction": chosen["hours_within_10_percent_fraction"],
        "hours_within_15_percent_fraction": chosen["hours_within_15_percent_fraction"],
        "actual_peak_mw": chosen["actual_peak_mw"],
        "prediction_at_actual_peak_mw": chosen["prediction_at_actual_peak_mw"],
        "signed_error_at_actual_peak_fraction": chosen[
            "signed_error_at_actual_peak_fraction"
        ],
        "relative_hourly_wape_gain_vs_aug_lightgbm": (
            None if base["wape"] == 0 else (base["wape"] - chosen["wape"]) / base["wape"]
        ),
        "relative_hourly_wape_gain_vs_physical": (
            None if physical["wape"] == 0
            else (physical["wape"] - chosen["wape"]) / physical["wape"]
        ),
        "months_beating_aug_lightgbm": int(sum(
            chosen_wape < base_wape
            for chosen_wape, base_wape in zip(monthly_wapes, base_wapes)
        )),
        "months_evaluated": len(monthly),
        "median_monthly_wape": float(np.median(monthly_wapes)),
        "best_monthly_wape": float(min(monthly_wapes)),
        "best_month": monthly[best_index]["month"],
        "worst_monthly_wape": float(max(monthly_wapes)),
        "worst_month": monthly[worst_index]["month"],
        "bootstrap_gain_vs_aug_lightgbm": significance,
    }


def _comparison_hash(frame: pd.DataFrame, columns: Iterable[str]) -> str:
    stable = frame.sort_values(["timestamp_utc", "usina_id"])[list(columns)]
    return hashlib.sha256(
        stable.to_csv(index=False, float_format="%.9g", lineterminator="\n").encode()
    ).hexdigest()


def run_annual_backtest(
    monthly_frames: list[tuple[str, pd.DataFrame]],
    config: TrainingConfig,
    base_model: lgb.Booster,
    dml: DMLPLRModel,
    calibration_factor: float,
    *,
    bootstrap_samples: int = 2000,
) -> tuple[dict[str, Any], pd.DataFrame, dict[str, Any]]:
    labels = [label for label, _ in monthly_frames]
    _periods_are_contiguous(labels)
    if config.scientific_target_column() != "geracao_referencia_mw":
        raise ValueError("Backtest anual exige geracao_referencia_mw.")
    if not np.isfinite(calibration_factor) or calibration_factor <= 0:
        raise ValueError("Fator de calibração congelado inválido.")
    if bootstrap_samples < 100:
        raise ValueError("Bootstrap anual exige ao menos 100 amostras.")
    raw_parts: list[pd.DataFrame] = []
    previous_end: pd.Timestamp | None = None
    for label, supplied in monthly_frames:
        frame = supplied.copy()
        frame["timestamp_utc"] = pd.to_datetime(frame["timestamp_utc"], utc=True)
        frame["usina_id"] = frame["usina_id"].astype(str)
        if frame.duplicated(["usina_id", "timestamp_utc"]).any():
            raise ValueError(f"Mês {label} contém chaves usina-hora duplicadas.")
        if previous_end is not None and frame["timestamp_utc"].min() <= previous_end:
            raise ValueError("Snapshots mensais anuais se sobrepõem ou estão fora de ordem.")
        previous_end = frame["timestamp_utc"].max()
        frame["evaluation_month"] = label
        raw_parts.append(frame)
    combined = pd.concat(raw_parts, ignore_index=True).sort_values(
        ["timestamp_utc", "usina_id"]
    )
    prepared = _prepared(combined, config.scientific_target_column(), config)
    if list(base_model.feature_name()) != FEATURE_COLUMNS:
        raise ValueError("Ordem de features do LightGBM anual incompatível.")
    base_correction_cf = base_model.predict(
        prepared[FEATURE_COLUMNS], num_threads=config.n_jobs
    )
    prepared["lightgbm_aug_mw"] = apply_physical_bounds(
        prepared["baseline_mw"],
        base_correction_cf * prepared["capacidade_instalada_mw"].to_numpy(),
        prepared["wind_speed_hub_m"],
        prepared["capacidade_instalada_mw"],
        prepared["disponibilidade"],
        config.physical_curve,
    )
    known = prepared["usina_id"].isin(set(dml.plant_ids))
    prepared["dml_aug_mw"] = prepared["baseline_mw"].to_numpy(dtype=float)
    if known.any():
        candidate = prepared.loc[known]
        dml_correction_cf = dml.predict_residual_cf(candidate)
        prepared.loc[known, "dml_aug_mw"] = apply_physical_bounds(
            candidate["baseline_mw"],
            dml_correction_cf * candidate["capacidade_instalada_mw"].to_numpy(),
            candidate["wind_speed_hub_m"],
            candidate["capacidade_instalada_mw"],
            candidate["disponibilidade"],
            config.physical_curve,
        )
    upper = (
        prepared["capacidade_instalada_mw"].to_numpy(dtype=float)
        * prepared["disponibilidade"].to_numpy(dtype=float)
    )
    prepared["lightgbm_aug_sep_scalar_mw"] = np.clip(
        prepared["lightgbm_aug_mw"].to_numpy(dtype=float) * calibration_factor,
        0.0,
        upper,
    )
    prepared["dml_known_plant"] = known.astype("int8")
    prepared["reference_within_available_capacity"] = (
        prepared["target_mw"] <= upper + 1e-9
    ).astype("int8")

    columns = {
        "physical": "baseline_mw",
        "lightgbm_aug": "lightgbm_aug_mw",
        "dml_aug": "dml_aug_mw",
        "lightgbm_aug_plus_sep_scalar": "lightgbm_aug_sep_scalar_mw",
    }
    overall = {name: _model_metrics(prepared, column) for name, column in columns.items()}
    monthly = _monthly_metrics(prepared, columns)
    significance = _paired_day_bootstrap(
        prepared,
        "lightgbm_aug_mw",
        "lightgbm_aug_sep_scalar_mw",
        samples=bootstrap_samples,
        random_state=config.random_state + 100,
    )
    traction = _traction_summary(overall, monthly, significance)
    prediction_columns = [
        "evaluation_month", "timestamp_utc", "usina_id", "target_mw",
        "capacidade_instalada_mw", "disponibilidade", "wind_speed_100m",
        "wind_speed_hub_m", "air_density_kg_m3", "baseline_mw",
        "lightgbm_aug_mw", "dml_aug_mw", "lightgbm_aug_sep_scalar_mw",
        "dml_known_plant", "reference_within_available_capacity",
    ]
    predictions = prepared[prediction_columns].sort_values(
        ["timestamp_utc", "usina_id"]
    ).reset_index(drop=True)
    report = {
        "schema_version": SCHEMA_VERSION,
        "status": "exploratory_retrospective_annual_backtest_complete",
        "scientifically_approved": False,
        "target": "geracao_referencia_mw",
        "primary_population": "all physically valid rows; no target-based filtering",
        "primary_metric": "aggregate hourly grid WAPE",
        "candidate_frozen": {
            "model": "August 2024 LightGBM residual",
            "september_scalar": calibration_factor,
            "refit_or_parameter_selection_on_annual_period": False,
        },
        "period": {
            "start_month": labels[0],
            "end_month": labels[-1],
            "months": labels,
            "rows": int(len(predictions)),
            "hours": int(predictions["timestamp_utc"].nunique()),
            "plants": int(predictions["usina_id"].nunique()),
        },
        "coverage": {
            "dml_known_plant_rows": int(known.sum()),
            "dml_fallback_rows": int((~known).sum()),
            "reference_above_available_rows": int(
                predictions["reference_within_available_capacity"].eq(0).sum()
            ),
        },
        "overall_metrics": overall,
        "monthly_metrics": monthly,
        "traction_summary": traction,
        "comparison_sha256": _comparison_hash(predictions, prediction_columns),
        "limitations": [
            "The annual window follows training/adaptation chronologically, but candidate carry-forward was also informed by later January/April 2026 checkpoints.",
            "This is a retrospective historical-weather backtest, not a future weather forecast evaluation.",
            "ERA5 reanalysis does not include operational weather-forecast error.",
            "The ONS reference target remains a proxy pending domain approval.",
            "No ANAREDE convergence claim is made; this evaluator measures generation input error only.",
        ],
    }
    return report, predictions, traction


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Avalia por 12 meses o candidato congelado para o total horário da rede."
    )
    parser.add_argument("--months", nargs=12, required=True, type=Path)
    parser.add_argument("--source-artifact", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--bootstrap-samples", type=int, default=2000)
    args = parser.parse_args()
    if args.output_dir.exists():
        raise FileExistsError("Diretório anual já existe; o resultado não pode ser sobrescrito.")
    source_report_path = args.source_artifact / "iterative_report.json"
    source_report = json.loads(source_report_path.read_text(encoding="utf-8"))
    calibration_factor = float(
        source_report["adaptation"]["september_low_variance_scalar"]["selected"]["factor"]
    )
    config = TrainingConfig.from_dict(source_report["config"])
    model_path = args.source_artifact / "base_lightgbm.txt"
    recorded_model = source_report["outputs"]["models"]["base_lightgbm"]
    if sha256_file(model_path) != recorded_model["sha256"]:
        raise ValueError("Hash do LightGBM base diverge do relatório congelado.")
    base_model = lgb.Booster(model_file=str(model_path))
    dml = DMLPLRModel.load(args.source_artifact / "base_dml_bundle")

    labels = [path.stem for path in args.months]
    _periods_are_contiguous(labels)
    monthly_frames: list[tuple[str, pd.DataFrame]] = []
    validations: dict[str, Any] = {}
    for label, path in zip(labels, args.months):
        frame, validation = prepare_snapshot(read_tabular(path), config)
        monthly_frames.append((label, frame))
        validations[label] = validation

    args.output_dir.mkdir(parents=True)
    receipt_path = args.output_dir / "annual_access_receipt.json"
    atomic_write_json(receipt_path, {
        "schema_version": "climagrid-annual-access-v1",
        "accessed_at_utc": utc_now_iso(),
        "purpose": "single frozen retrospective annual evaluation",
        "months": [
            {"label": label, "path": str(path), "sha256": sha256_file(path)}
            for label, path in zip(labels, args.months)
        ],
        "source_artifact": {
            "path": str(args.source_artifact),
            "report_sha256": sha256_file(source_report_path),
            "model_sha256": sha256_file(model_path),
        },
        "refit_or_parameter_selection": False,
    })
    report, predictions, traction = run_annual_backtest(
        monthly_frames,
        config,
        base_model,
        dml,
        calibration_factor,
        bootstrap_samples=args.bootstrap_samples,
    )
    predictions_path = args.output_dir / "annual_predictions.parquet"
    traction_path = args.output_dir / "traction_summary.json"
    atomic_write_parquet(predictions, predictions_path)
    atomic_write_json(traction_path, traction)
    report.update({
        "inputs": {
            "months": [
                {"label": label, "path": str(path), "sha256": sha256_file(path)}
                for label, path in zip(labels, args.months)
            ],
            "source_report": {
                "path": str(source_report_path), "sha256": sha256_file(source_report_path)
            },
            "base_model": {"path": str(model_path), "sha256": sha256_file(model_path)},
        },
        "outputs": {
            "predictions_sha256": sha256_file(predictions_path),
            "traction_summary_sha256": sha256_file(traction_path),
            "annual_access_receipt_sha256": sha256_file(receipt_path),
        },
        "validation": validations,
    })
    report_path = args.output_dir / "annual_report.json"
    atomic_write_json(report_path, report)
    print(json.dumps({
        "status": report["status"],
        "report": str(report_path),
        "traction": traction,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
