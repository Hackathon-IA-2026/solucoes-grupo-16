"""Counterfactual audit of frozen annual predictions against verified ONS generation.

The frozen predictions were trained and selected to estimate
``geracao_referencia_mw`` (generation without operational limitation).  This
module does not refit or reinterpret that scientific target.  It answers a
separate product question: what would the usual error metrics look like if the
same predictions were compared with ``geracao_verificada_mw`` (generation
actually delivered) over exactly the same plant-hours?
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from ingestion.common.io import (
    atomic_write_json,
    atomic_write_parquet,
    read_tabular,
    sha256_file,
    utc_now_iso,
)
from training.causal.annual_backtest import (
    _model_metrics,
    _monthly_metrics,
    _periods_are_contiguous,
)


SCHEMA_VERSION = "climagrid-verified-generation-counterfactual-audit-v1"
MODEL_COLUMNS = {
    "physical": "baseline_mw",
    "lightgbm_aug": "lightgbm_aug_mw",
    "dml_aug": "dml_aug_mw",
    "lightgbm_aug_plus_sep_scalar": "lightgbm_aug_sep_scalar_mw",
}


def assemble_verified_frame(
    annual_predictions: pd.DataFrame,
    monthly_frames: list[tuple[str, pd.DataFrame]],
) -> pd.DataFrame:
    """Strictly align verified ONS observations with frozen predictions."""
    labels = [label for label, _ in monthly_frames]
    _periods_are_contiguous(labels)
    required_predictions = {
        "evaluation_month", "timestamp_utc", "usina_id", "target_mw",
        "capacidade_instalada_mw", *MODEL_COLUMNS.values(),
    }
    missing_predictions = required_predictions.difference(annual_predictions.columns)
    if missing_predictions:
        raise ValueError(
            "Predições anuais sem colunas obrigatórias: "
            + ", ".join(sorted(missing_predictions))
        )

    predictions = annual_predictions.copy()
    predictions["evaluation_month"] = predictions["evaluation_month"].astype(str)
    predictions["timestamp_utc"] = pd.to_datetime(predictions["timestamp_utc"], utc=True)
    predictions["usina_id"] = predictions["usina_id"].astype(str)
    keys = ["evaluation_month", "timestamp_utc", "usina_id"]
    if predictions.duplicated(keys).any():
        raise ValueError("Predições anuais contêm chaves mês-usina-hora duplicadas.")
    if sorted(predictions["evaluation_month"].unique().tolist()) != labels:
        raise ValueError("Meses das predições não coincidem com os snapshots informados.")

    observations: list[pd.DataFrame] = []
    for label, supplied in monthly_frames:
        missing = {
            "timestamp_utc", "usina_id", "geracao_referencia_mw",
            "geracao_verificada_mw",
        }.difference(supplied.columns)
        if missing:
            raise ValueError(
                f"Snapshot {label} sem colunas obrigatórias: "
                + ", ".join(sorted(missing))
            )
        frame = supplied[[
            "timestamp_utc", "usina_id", "geracao_referencia_mw",
            "geracao_verificada_mw",
        ]].copy()
        frame["evaluation_month"] = label
        frame["timestamp_utc"] = pd.to_datetime(frame["timestamp_utc"], utc=True)
        frame["usina_id"] = frame["usina_id"].astype(str)
        if frame.duplicated(keys).any():
            raise ValueError(f"Snapshot {label} contém chaves usina-hora duplicadas.")
        observations.append(frame)

    observed = pd.concat(observations, ignore_index=True)
    if observed[["geracao_referencia_mw", "geracao_verificada_mw"]].isna().any().any():
        raise ValueError("A auditoria exige referência e geração verificada em todas as linhas.")
    merged = predictions.merge(
        observed,
        on=keys,
        how="outer",
        validate="one_to_one",
        indicator=True,
    )
    unmatched = merged["_merge"].ne("both")
    if unmatched.any():
        counts = merged.loc[unmatched, "_merge"].value_counts().to_dict()
        raise ValueError(f"Cobertura usina-hora incompleta entre predição e ONS: {counts}")
    merged = merged.drop(columns="_merge")

    recorded_reference = merged["target_mw"].to_numpy(dtype=float)
    snapshot_reference = merged["geracao_referencia_mw"].to_numpy(dtype=float)
    if not np.allclose(recorded_reference, snapshot_reference, rtol=0.0, atol=1e-8):
        largest = float(np.max(np.abs(recorded_reference - snapshot_reference)))
        raise ValueError(
            "A referência do snapshot diverge do target congelado "
            f"(máxima diferença {largest:.9g} MW)."
        )
    merged = merged.rename(columns={"target_mw": "reference_target_mw"})
    merged["target_mw"] = merged["geracao_verificada_mw"].astype(float)
    return merged.sort_values(keys).reset_index(drop=True)


def _reference_gap(frame: pd.DataFrame) -> dict[str, Any]:
    reference = frame["reference_target_mw"].to_numpy(dtype=float)
    verified = frame["target_mw"].to_numpy(dtype=float)
    gap = reference - verified
    hourly = frame.groupby("timestamp_utc", as_index=False).agg(
        reference_mw=("reference_target_mw", "sum"),
        verified_mw=("target_mw", "sum"),
    )
    hourly_gap = hourly["reference_mw"].to_numpy() - hourly["verified_mw"].to_numpy()
    reference_total = float(reference.sum())
    verified_total = float(verified.sum())
    return {
        "reference_total_mwh": reference_total,
        "verified_total_mwh": verified_total,
        "reference_minus_verified_mwh": reference_total - verified_total,
        "reference_minus_verified_fraction_of_reference": (
            None if reference_total == 0 else (reference_total - verified_total) / reference_total
        ),
        "verified_fraction_of_reference": (
            None if reference_total == 0 else verified_total / reference_total
        ),
        "plant_hours_reference_above_verified_fraction": float(np.mean(gap > 1e-9)),
        "plant_hours_reference_equal_verified_fraction": float(np.mean(np.abs(gap) <= 1e-9)),
        "plant_hours_reference_below_verified_fraction": float(np.mean(gap < -1e-9)),
        "grid_hours_reference_above_verified_fraction": float(np.mean(hourly_gap > 1e-9)),
        "grid_hours_reference_below_verified_fraction": float(np.mean(hourly_gap < -1e-9)),
    }


def _summary(
    verified_metrics: dict[str, Any],
    reference_metrics: dict[str, Any],
    gap: dict[str, Any],
    monthly: list[dict[str, Any]],
) -> dict[str, Any]:
    hourly_wapes = {
        name: values["hourly_grid_total"]["wape"]
        for name, values in verified_metrics.items()
        if name != "ons_reference"
    }
    best_model = min(hourly_wapes, key=hourly_wapes.get)
    candidate = verified_metrics["lightgbm_aug_plus_sep_scalar"]
    base = verified_metrics["lightgbm_aug"]
    return {
        "audit_kind": "counterfactual_comparison_not_original_target_accuracy",
        "evaluation_target": "geracao_verificada_mw",
        "original_training_target": "geracao_referencia_mw",
        "primary_level": "aggregate hourly grid total",
        "rows": int(candidate["plant_hour"]["rows"]),
        "hours": int(candidate["hourly_grid_total"]["rows"]),
        "verified_energy_mwh": gap["verified_total_mwh"],
        "ons_reference_energy_mwh": gap["reference_total_mwh"],
        "ons_reference_minus_verified_fraction_of_reference": gap[
            "reference_minus_verified_fraction_of_reference"
        ],
        "best_counterfactual_model_by_hourly_wape": best_model,
        "best_counterfactual_hourly_wape": hourly_wapes[best_model],
        "lightgbm_aug_hourly_grid": base["hourly_grid_total"],
        "frozen_candidate_hourly_grid": candidate["hourly_grid_total"],
        "frozen_candidate_plant_hour": candidate["plant_hour"],
        "ons_reference_vs_verified_hourly_grid": verified_metrics[
            "ons_reference"
        ]["hourly_grid_total"],
        "frozen_candidate_original_reference_hourly_grid": reference_metrics[
            "lightgbm_aug_plus_sep_scalar"
        ]["hourly_grid_total"],
        "months": [
            {
                "month": row["month"],
                "lightgbm_aug_wape": row["lightgbm_aug"]["wape"],
                "frozen_candidate_wape": row[
                    "lightgbm_aug_plus_sep_scalar"
                ]["wape"],
                "ons_reference_wape": row["ons_reference"]["wape"],
            }
            for row in monthly
        ],
        "interpretation": (
            "The predictions estimate no-limitation reference generation. Closeness to "
            "verified generation can arise because model underestimation offsets the "
            "reference-to-verified operational gap; it is not evidence that the model "
            "learned curtailment or actual delivered generation."
        ),
    }


def run_verified_generation_audit(
    annual_predictions: pd.DataFrame,
    monthly_frames: list[tuple[str, pd.DataFrame]],
) -> tuple[dict[str, Any], pd.DataFrame, dict[str, Any]]:
    frame = assemble_verified_frame(annual_predictions, monthly_frames)
    verified_columns = {**MODEL_COLUMNS, "ons_reference": "reference_target_mw"}
    verified_metrics = {
        name: _model_metrics(frame, column) for name, column in verified_columns.items()
    }
    monthly = _monthly_metrics(frame, verified_columns)

    against_reference = frame.copy()
    against_reference["target_mw"] = against_reference["reference_target_mw"]
    reference_metrics = {
        name: _model_metrics(against_reference, column)
        for name, column in MODEL_COLUMNS.items()
    }
    gap = _reference_gap(frame)
    summary = _summary(verified_metrics, reference_metrics, gap, monthly)
    report = {
        "schema_version": SCHEMA_VERSION,
        "status": "exploratory_counterfactual_verified_generation_audit_complete",
        "scientifically_approved_as_actual_generation_model": False,
        "evaluation_target": "geracao_verificada_mw",
        "original_training_and_selection_target": "geracao_referencia_mw",
        "predictions_refit_or_reselected": False,
        "primary_metric": "aggregate hourly grid WAPE",
        "period": {
            "start_month": str(frame["evaluation_month"].min()),
            "end_month": str(frame["evaluation_month"].max()),
            "months": sorted(frame["evaluation_month"].unique().tolist()),
            "rows": int(len(frame)),
            "hours": int(frame["timestamp_utc"].nunique()),
            "plants": int(frame["usina_id"].nunique()),
        },
        "coverage": {
            "verified_generation_rows": int(frame["target_mw"].notna().sum()),
            "missing_verified_generation_rows": int(frame["target_mw"].isna().sum()),
            "matched_prediction_rows": int(len(frame)),
        },
        "verified_target_metrics": verified_metrics,
        "original_reference_target_metrics_recomputed": reference_metrics,
        "monthly_verified_target_metrics": monthly,
        "ons_reference_verified_gap": gap,
        "summary": summary,
        "limitations": [
            "The models were not trained or selected to predict verified generation.",
            "Operational restrictions, availability, dispatch and ONS data construction can separate reference from verified generation.",
            "A smaller error against verified generation may be an accidental cancellation between model underestimation and the reference-to-verified gap.",
            "ERA5 reanalysis is historical weather, not a future weather forecast.",
            "No ANAREDE convergence claim is made.",
        ],
    }
    output_columns = [
        "evaluation_month", "timestamp_utc", "usina_id", "reference_target_mw",
        "geracao_verificada_mw", "capacidade_instalada_mw", *MODEL_COLUMNS.values(),
    ]
    return report, frame[output_columns].copy(), summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Compara contrafactualmente as predições anuais congeladas com a geração "
            "verificada da ONS, sem retreino."
        )
    )
    parser.add_argument("--predictions", required=True, type=Path)
    parser.add_argument("--annual-report", required=True, type=Path)
    parser.add_argument("--months", nargs=12, required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    if args.output_dir.exists():
        raise FileExistsError("Diretório da auditoria já existe; não será sobrescrito.")

    labels = [path.stem for path in args.months]
    _periods_are_contiguous(labels)
    annual_report = json.loads(args.annual_report.read_text(encoding="utf-8"))
    if annual_report.get("target") != "geracao_referencia_mw":
        raise ValueError("Relatório anual de origem não usa a referência ONS como target.")
    if annual_report.get("period", {}).get("months") != labels:
        raise ValueError("Meses do relatório anual não coincidem com os snapshots.")

    predictions = read_tabular(args.predictions)
    monthly_frames = [(label, read_tabular(path)) for label, path in zip(labels, args.months)]
    report, audit_predictions, summary = run_verified_generation_audit(
        predictions, monthly_frames
    )

    args.output_dir.mkdir(parents=True)
    predictions_path = args.output_dir / "verified_audit_predictions.parquet"
    summary_path = args.output_dir / "verified_audit_summary.json"
    receipt_path = args.output_dir / "verified_audit_access_receipt.json"
    atomic_write_parquet(audit_predictions, predictions_path)
    atomic_write_json(summary_path, summary)
    atomic_write_json(receipt_path, {
        "schema_version": "climagrid-verified-generation-audit-access-v1",
        "accessed_at_utc": utc_now_iso(),
        "purpose": "counterfactual frozen-prediction comparison with verified ONS generation",
        "predictions": {"path": str(args.predictions), "sha256": sha256_file(args.predictions)},
        "annual_report": {"path": str(args.annual_report), "sha256": sha256_file(args.annual_report)},
        "months": [
            {"label": label, "path": str(path), "sha256": sha256_file(path)}
            for label, path in zip(labels, args.months)
        ],
        "refit_or_parameter_selection": False,
    })
    report.update({
        "inputs": {
            "predictions": {"path": str(args.predictions), "sha256": sha256_file(args.predictions)},
            "annual_report": {"path": str(args.annual_report), "sha256": sha256_file(args.annual_report)},
            "months": [
                {"label": label, "path": str(path), "sha256": sha256_file(path)}
                for label, path in zip(labels, args.months)
            ],
        },
        "outputs": {
            "predictions_sha256": sha256_file(predictions_path),
            "summary_sha256": sha256_file(summary_path),
            "access_receipt_sha256": sha256_file(receipt_path),
        },
    })
    report_path = args.output_dir / "verified_audit_report.json"
    atomic_write_json(report_path, report)
    print(json.dumps({
        "status": report["status"],
        "report": str(report_path),
        "summary": summary,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
