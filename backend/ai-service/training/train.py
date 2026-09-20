"""Train the approved-only LightGBM residual model with a temporal split."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from training.build_dataset import TabularDatasetAdapter, prepare_hourly_dataset
from training.config import TrainingConfig, default_artifact_dir
from training.evaluate import empirical_interval_table, metrics_by_wind_and_plant
from training.features import FEATURE_COLUMNS, add_features, feature_matrix
from training.physical_curve import apply_physical_bounds, physical_power_mw


def temporal_split(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    """Split contiguous timestamp blocks 70/15/15 without shuffling rows."""
    ordered = frame.sort_values(["timestamp_utc", "usina_id"]).copy()
    timestamps = pd.Index(ordered["timestamp_utc"].drop_duplicates().sort_values())
    if len(timestamps) < 7:
        raise ValueError("São necessários ao menos sete timestamps horários para split temporal 70/15/15.")
    train_end = max(1, int(len(timestamps) * 0.70))
    valid_end = max(train_end + 1, int(len(timestamps) * 0.85))
    valid_end = min(valid_end, len(timestamps) - 1)
    train_times, valid_times, test_times = timestamps[:train_end], timestamps[train_end:valid_end], timestamps[valid_end:]
    parts = tuple(ordered[ordered.timestamp_utc.isin(times)].copy() for times in (train_times, valid_times, test_times))
    periods = {
        name: {"start": group.timestamp_utc.min().isoformat(), "end": group.timestamp_utc.max().isoformat(), "rows": int(len(group))}
        for name, group in zip(("train", "validation", "test"), parts)
    }
    return (*parts, periods)


def _prepared(frame: pd.DataFrame, target_column: str, config: TrainingConfig) -> pd.DataFrame:
    prepared = add_features(frame)
    prepared["target_mw"] = pd.to_numeric(prepared[target_column], errors="coerce")
    prepared["baseline_mw"] = physical_power_mw(
        prepared.wind_speed_100m, prepared.capacidade_instalada_mw, prepared.disponibilidade, config.physical_curve
    )
    prepared["target_cf"] = prepared.target_mw / prepared.capacidade_instalada_mw
    prepared["baseline_cf"] = prepared.baseline_mw / prepared.capacidade_instalada_mw
    prepared["residual_cf"] = prepared.target_cf - prepared.baseline_cf
    return prepared


def _json_default(value: object) -> object:
    if isinstance(value, (np.integer, np.floating)):
        return value.item()
    if isinstance(value, Path):
        return str(value)
    raise TypeError(f"Não serializável: {type(value)!r}")


def train(dataset: pd.DataFrame, config: TrainingConfig, artifact_dir: Path) -> dict:
    target_column = config.target_column()
    prepared = _prepared(dataset, target_column, config)
    train_df, valid_df, test_df, periods = temporal_split(prepared)
    X_train, X_valid, X_test = (feature_matrix(part) for part in (train_df, valid_df, test_df))
    params = dict(objective="regression_l1", learning_rate=0.04, n_estimators=2500, num_leaves=31,
                  min_child_samples=100, subsample=0.8, colsample_bytree=0.8, reg_lambda=5.0,
                  random_state=42, n_jobs=-1)
    model = lgb.LGBMRegressor(**params)
    model.fit(X_train, train_df.residual_cf, eval_set=[(X_valid, valid_df.residual_cf)], eval_metric="mae",
              callbacks=[lgb.early_stopping(100, verbose=False)])
    for part, matrix in ((valid_df, X_valid), (test_df, X_test)):
        part["ml_correction_mw"] = model.predict(matrix) * part.capacidade_instalada_mw
        part["hybrid_mw"] = apply_physical_bounds(part.baseline_mw, part.ml_correction_mw, part.wind_speed_100m,
                                                   part.capacidade_instalada_mw, part.disponibilidade, config.physical_curve)
    baseline_metrics = metrics_by_wind_and_plant(test_df.assign(hybrid_mw=test_df.baseline_mw), "hybrid_mw")
    hybrid_metrics = metrics_by_wind_and_plant(test_df, "hybrid_mw")
    approved = hybrid_metrics["overall"]["mae_mw"] < baseline_metrics["overall"]["mae_mw"]
    intervals = empirical_interval_table(valid_df, config.min_interval_samples)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    model.booster_.save_model(str(artifact_dir / "model.txt"))
    (artifact_dir / "residual_quantiles.json").write_text(json.dumps(intervals, ensure_ascii=False, indent=2, default=_json_default), encoding="utf-8")
    wind_domain = {"min": float(prepared.wind_speed_100m.min()), "max": float(prepared.wind_speed_100m.max())}
    metadata = {
        "model_version": config.model_version,
        "model_scope": config.scope,
        "approved": bool(approved),
        "approval_rule": "hybrid test MAE must be lower than physical baseline test MAE",
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "target": config.target,
        "features": FEATURE_COLUMNS,
        "feature_order": FEATURE_COLUMNS,
        "physical_curve": config.serializable()["physical_curve"],
        "split_periods": periods,
        "metrics": {"baseline_test": baseline_metrics, "hybrid_test": hybrid_metrics},
        "wind_speed_domain_ms": wind_domain,
        "lightgbm_params": params,
        "data_snapshot": "configured local input; replace with identified ONS/ERA5 snapshot",
    }
    (artifact_dir / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2, default=_json_default), encoding="utf-8")
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Treina LightGBM residual do ClimaGrid.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--target", required=True, choices=["geracao_referencia_mw", "geracao_verificada_mw"])
    parser.add_argument("--artifacts", type=Path, default=default_artifact_dir())
    args = parser.parse_args()
    config = TrainingConfig(target=args.target)
    raw = TabularDatasetAdapter().load(args.input)
    dataset, report = prepare_hourly_dataset(raw, config)
    metadata = train(dataset, config, args.artifacts)
    (args.artifacts / "validation_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"artifact_dir": str(args.artifacts), "approved": metadata["approved"], "metrics": metadata["metrics"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
