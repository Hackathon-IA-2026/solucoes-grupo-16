"""Build pitch-ready, explicitly exploratory insights from paired temporal comparisons."""
from __future__ import annotations

import argparse
from dataclasses import asdict
import hashlib
import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from ingestion.common.io import atomic_write_json, atomic_write_parquet, read_tabular, sha256_file
from training.build_dataset import prepare_snapshot
from training.causal.dml_plr import NuisanceConfig, eligible_causal_rows, fit_dml_plr
from training.causal.spec import CausalEstimandSpec
from training.causal.temporal_crossfit import expanding_time_splits
from training.config import TrainingConfig, load_config
from training.evaluate import WIND_BINS, WIND_LABELS, regression_metrics
from training.features import FEATURE_COLUMNS, feature_matrix
from training.physical_curve import apply_physical_bounds
from training.protocol import sha256_json
from training.train import _prepared


SCHEMA_VERSION = "climagrid-dml-hackathon-insights-v1"


def _fixed_residual_model(config: TrainingConfig) -> lgb.LGBMRegressor:
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


def _metrics(frame: pd.DataFrame, column: str) -> dict:
    return regression_metrics(
        frame["target_mw"], frame[column], frame["capacidade_instalada_mw"]
    )


def _gain(candidate: dict, baseline: dict, metric: str) -> float | None:
    denominator = baseline[metric]
    if denominator == 0:
        return None
    return float((denominator - candidate[metric]) / denominator)


def _comparison_hash(frame: pd.DataFrame) -> str:
    columns = [
        "fold_id", "timestamp_utc", "usina_id", "target_mw",
        "capacidade_instalada_mw", "disponibilidade", "baseline_mw",
        "lightgbm_mw", "dml_mw",
    ]
    stable = frame.sort_values(["fold_id", "timestamp_utc", "usina_id"])[columns]
    return hashlib.sha256(
        stable.to_csv(index=False, float_format="%.9g", lineterminator="\n").encode()
    ).hexdigest()


def _chart_payload(predictions: pd.DataFrame, fold_summaries: list[dict]) -> dict:
    density = predictions.copy()
    density["density_band"] = pd.qcut(
        density["air_density_kg_m3"], q=min(8, density["air_density_kg_m3"].nunique()),
        duplicates="drop",
    )
    density_response = []
    for label, group in density.groupby("density_band", observed=True):
        density_response.append({
            "label": str(label),
            "density": float(group["air_density_kg_m3"].mean()),
            "physical_error_mw": float((group["baseline_mw"] - group["target_mw"]).mean()),
            "dml_correction_mw": float((group["dml_mw"] - group["baseline_mw"]).mean()),
            "rows": int(len(group)),
        })
    hourly = predictions.groupby("timestamp_utc", as_index=False).agg(
        target_mw=("target_mw", "sum"),
        physical_mw=("baseline_mw", "sum"),
        dml_mw=("dml_mw", "sum"),
        lightgbm_mw=("lightgbm_mw", "sum"),
        plants=("usina_id", "nunique"),
    )
    if len(hourly) > 168:
        positions = np.linspace(0, len(hourly) - 1, 168, dtype=int)
        hourly = hourly.iloc[np.unique(positions)]
    wind = predictions.copy()
    wind["wind_band"] = pd.cut(
        wind["wind_speed_hub_m"], WIND_BINS, labels=WIND_LABELS, right=False
    )
    wind_rows = []
    for label, group in wind.groupby("wind_band", observed=True):
        wind_rows.append({
            "label": str(label),
            "physical_mae_mw": _metrics(group, "baseline_mw")["mae_mw"],
            "dml_mae_mw": _metrics(group, "dml_mw")["mae_mw"],
            "lightgbm_mae_mw": _metrics(group, "lightgbm_mw")["mae_mw"],
            "rows": int(len(group)),
        })
    return {
        "fold_performance": [{
            "fold_id": item["fold_id"],
            "physical_mae_mw": item["metrics"]["physical"]["mae_mw"],
            "dml_mae_mw": item["metrics"]["dml"]["mae_mw"],
            "lightgbm_mae_mw": item["metrics"]["lightgbm"]["mae_mw"],
        } for item in fold_summaries],
        "density_response": density_response,
        "wind_performance": wind_rows,
        "hourly_sample": [
            {**row, "timestamp_utc": pd.Timestamp(row["timestamp_utc"]).isoformat()}
            for row in hourly.to_dict("records")
        ],
    }


def build_hackathon_insights(
    dataset: pd.DataFrame,
    config: TrainingConfig,
    spec: CausalEstimandSpec,
    *,
    outer_splits: int = 3,
    nuisance_config: NuisanceConfig | None = None,
) -> tuple[dict, pd.DataFrame, object]:
    """Compare physical, fixed residual LightGBM and DML on identical future rows."""
    if spec.status not in {"infrastructure_test", "exploratory"}:
        raise ValueError("Relatório de hackathon aceita somente estimando exploratório.")
    if config.scientific_target_column() != "geracao_referencia_mw":
        raise ValueError("Insights DML exigem geracao_referencia_mw.")
    spec.validate_feature_config(config.features)
    prepared = _prepared(dataset, config.scientific_target_column(), config)
    nuisance = nuisance_config or NuisanceConfig(
        random_state=config.random_state, n_jobs=config.n_jobs,
    )
    outer = expanding_time_splits(
        prepared["timestamp_utc"], n_splits=outer_splits,
        gap_hours=config.features.required_history_hours if config.features.require_complete_history else 0,
    )
    prediction_frames: list[pd.DataFrame] = []
    fold_summaries: list[dict] = []
    evaluation_rows_total = 0
    fallback_unknown_plant_rows = 0
    fallback_incomplete_context_rows = 0
    for fold in outer:
        train = eligible_causal_rows(prepared.iloc[fold.train_indices].copy(), config.features)
        evaluation_input = prepared.iloc[fold.evaluation_indices].copy()
        evaluation_candidate = eligible_causal_rows(evaluation_input, config.features)
        known_plants = set(train["usina_id"].astype(str).unique())
        known_mask = evaluation_candidate["usina_id"].astype(str).isin(known_plants)
        evaluation = evaluation_candidate.loc[known_mask].copy()
        evaluation_rows_total += len(evaluation_input)
        fallback_incomplete_context_rows += len(evaluation_input) - len(evaluation_candidate)
        fallback_unknown_plant_rows += int((~known_mask).sum())
        if train.empty or evaluation.empty:
            raise ValueError(f"Fold {fold.fold_id} sem linhas elegíveis.")
        dml = fit_dml_plr(train, spec, nuisance, feature_config=config.features)
        dml_correction = dml.predict_residual_cf(evaluation) * evaluation["capacidade_instalada_mw"]
        evaluation["dml_mw"] = apply_physical_bounds(
            evaluation["baseline_mw"], dml_correction, evaluation["wind_speed_hub_m"],
            evaluation["capacidade_instalada_mw"], evaluation["disponibilidade"],
            config.physical_curve,
        )
        residual = _fixed_residual_model(config)
        residual.fit(feature_matrix(train, config.features), train["residual_cf"])
        lgb_correction = residual.predict(feature_matrix(evaluation, config.features)) * evaluation["capacidade_instalada_mw"]
        evaluation["lightgbm_mw"] = apply_physical_bounds(
            evaluation["baseline_mw"], lgb_correction, evaluation["wind_speed_hub_m"],
            evaluation["capacidade_instalada_mw"], evaluation["disponibilidade"],
            config.physical_curve,
        )
        evaluation["fold_id"] = fold.fold_id
        metrics = {
            "physical": _metrics(evaluation, "baseline_mw"),
            "lightgbm": _metrics(evaluation, "lightgbm_mw"),
            "dml": _metrics(evaluation, "dml_mw"),
        }
        fold_summaries.append({
            "fold_id": fold.fold_id,
            "train_start_utc": fold.train_start_utc,
            "train_end_utc": fold.train_end_utc,
            "evaluation_start_utc": fold.evaluation_start_utc,
            "evaluation_end_utc": fold.evaluation_end_utc,
            "train_rows": int(len(train)),
            "evaluation_rows_input": int(len(evaluation_input)),
            "evaluation_rows_with_context": int(len(evaluation_candidate)),
            "evaluation_rows_eligible": int(len(evaluation)),
            "fallback_unknown_plant_rows": int((~known_mask).sum()),
            "unknown_evaluation_plants": sorted(
                evaluation_candidate.loc[~known_mask, "usina_id"].astype(str).unique().tolist()
            ),
            "metrics": metrics,
            "dml_effect": {
                "theta": dml.theta,
                "confidence_interval_95": dml.diagnostics["confidence_interval_95"],
                "treatment_residual_std": dml.diagnostics["treatment_residual_std"],
                "rows_oof": dml.diagnostics["rows_oof"],
                "cluster_count": dml.diagnostics["inference_cluster_count"],
                "expected_sign_matches": dml.diagnostics["expected_sign_matches"],
            },
        })
        prediction_frames.append(evaluation[[
            "fold_id", "timestamp_utc", "usina_id", "target_mw",
            "capacidade_instalada_mw", "disponibilidade", "wind_speed_100m",
            "wind_speed_hub_m", "air_density_kg_m3", "baseline_mw",
            "lightgbm_mw", "dml_mw", "temporal_context_complete", "most_applied",
        ]])
    predictions = pd.concat(prediction_frames, ignore_index=True).sort_values(
        ["timestamp_utc", "usina_id", "fold_id"]
    ).reset_index(drop=True)
    overall = {
        "physical": _metrics(predictions, "baseline_mw"),
        "lightgbm": _metrics(predictions, "lightgbm_mw"),
        "dml": _metrics(predictions, "dml_mw"),
    }
    overall["lightgbm"]["mae_gain_vs_physical"] = _gain(overall["lightgbm"], overall["physical"], "mae_mw")
    overall["dml"]["mae_gain_vs_physical"] = _gain(overall["dml"], overall["physical"], "mae_mw")
    overall["dml"]["mae_gain_vs_lightgbm"] = _gain(overall["dml"], overall["lightgbm"], "mae_mw")
    minimum_inference_clusters = min(
        item["dml_effect"]["cluster_count"] for item in fold_summaries
    )
    report = {
        "schema_version": SCHEMA_VERSION,
        "status": "exploratory_evidence",
        "scientifically_approved": False,
        "operational_model": "physical_curve",
        "experimental_challenger": "dml_air_density",
        "message": "Resultados exploratórios para pitch; não constituem homologação científica ou operacional.",
        "target": "geracao_referencia_mw",
        "target_semantics": "ONS proxy for generation without limitation; pending domain approval",
        "comparison": {
            "paired": True,
            "rows": int(len(predictions)),
            "hours": int(predictions["timestamp_utc"].nunique()),
            "plants": int(predictions["usina_id"].nunique()),
            "comparison_sha256": _comparison_hash(predictions),
            "feature_order_sha256": sha256_json(FEATURE_COLUMNS),
            "outer_split_strategy": "forward_expanding_timestamp_blocks",
            "outer_splits": outer_splits,
        },
        "coverage": {
            "evaluation_rows": int(evaluation_rows_total),
            "model_rows": int(len(predictions)),
            "fallback_rows": int(evaluation_rows_total - len(predictions)),
            "fallback_unknown_plant_rows": int(fallback_unknown_plant_rows),
            "fallback_incomplete_context_rows": int(fallback_incomplete_context_rows),
            "model_fraction": float(len(predictions) / evaluation_rows_total),
            "note": (
                "Metrics use the paired DML-eligible population. Rows from plants unseen in "
                "the corresponding training fold or without required context are explicit fallback."
            ),
        },
        "estimand": spec.serializable(),
        "estimand_sha256": spec.digest(),
        "feature_config": asdict(config.features),
        "nuisance_config": asdict(nuisance),
        "overall_metrics": overall,
        "folds": fold_summaries,
        "diagnostics": {
            "minimum_inference_clusters_per_fold": minimum_inference_clusters,
            "causal_interval_underpowered": minimum_inference_clusters < 10,
        },
        "charts": _chart_payload(predictions, fold_summaries),
        "limitations": [
            "DML estimates an effect under the declared controls; it does not prove absence of unobserved confounding.",
            "The ONS target is a proxy pending domain approval.",
            "The operational PWF flow continues to use the physical curve.",
            "Unknown plants or missing required climate/context must use physical fallback.",
            (
                "At least one fold has fewer than 10 temporal clusters; causal confidence "
                "intervals are underpowered and must not be used as confirmation."
                if minimum_inference_clusters < 10
                else "Causal confidence intervals remain exploratory."
            ),
        ],
    }
    final_model = fit_dml_plr(prepared, spec, nuisance, feature_config=config.features)
    return report, predictions, final_model


def main() -> None:
    parser = argparse.ArgumentParser(description="Gera insights DML exploratórios para o pitch.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--estimand", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--outer-splits", type=int, default=3)
    args = parser.parse_args()
    if args.output_dir.exists():
        raise FileExistsError("Diretório de saída já existe; use uma pasta versionada nova.")
    config = load_config(args.config)
    dataset, validation = prepare_snapshot(read_tabular(args.input), config)
    report, predictions, model = build_hackathon_insights(
        dataset, config, CausalEstimandSpec.load(args.estimand), outer_splits=args.outer_splits,
    )
    args.output_dir.mkdir(parents=True)
    predictions_path = args.output_dir / "paired_predictions.parquet"
    atomic_write_parquet(predictions, predictions_path)
    bundle = args.output_dir / "dml_bundle"
    metadata = model.save(bundle, provenance={
        "scope": "hackathon_exploratory",
        "input_sha256": sha256_file(args.input),
        "comparison_sha256": report["comparison"]["comparison_sha256"],
    })
    report.update({
        "input_sha256": sha256_file(args.input),
        "predictions_sha256": sha256_file(predictions_path),
        "dml_bundle_metadata_sha256": sha256_json(metadata),
        "validation_summary": validation,
    })
    atomic_write_json(args.output_dir / "insights.json", report)
    print(json.dumps({
        "status": report["status"],
        "output": str(args.output_dir / "insights.json"),
        "metrics": report["overall_metrics"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
