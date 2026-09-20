"""Train the approved-only LightGBM residual model with a temporal split."""
from __future__ import annotations

import argparse
import json
from dataclasses import replace
import platform
import hashlib
from datetime import datetime, timezone
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from training.build_dataset import DatasetValidationError, TabularDatasetAdapter, prepare_hourly_dataset, write_report, _write_dataframe
from training.config import ALLOWED_TARGETS, ColumnConfig, TrainingConfig, default_artifact_dir, load_config
from training.evaluate import dataset_fingerprint, empirical_interval_table, interval_coverage, metrics_by_wind_and_plant
from training.features import FEATURE_COLUMNS, add_features, feature_matrix
from training.physical_curve import apply_physical_bounds, physical_power_mw


def temporal_split(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    """Split contiguous timestamp blocks 70/15/15 without shuffling rows."""
    ordered = frame.sort_values(["timestamp_utc", "usina_id"]).copy()
    timestamps = pd.Index(ordered["timestamp_utc"].drop_duplicates().sort_values())
    if len(timestamps) < 7:
        raise ValueError("São necessários ao menos sete timestamps horários para split temporal 70/15/15.")
    train_end = max(1, len(timestamps) * 70 // 100)
    valid_end = max(train_end + 1, len(timestamps) * 85 // 100)
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
    if (artifact_dir / "model.txt").exists():
        raise FileExistsError("Artefato já existe; escolha outro diretório versionado com --artifacts.")
    checked, report = prepare_hourly_dataset(dataset, replace(config, columns=ColumnConfig()))
    if len(checked) != len(dataset):
        raise ValueError("train() exige dataset horário já validado; execute prepare_hourly_dataset primeiro.")
    dataset = checked
    prepared = _prepared(dataset, target_column, config)
    train_df, valid_df, test_df, periods = temporal_split(prepared)
    X_train, X_valid, X_test = (feature_matrix(part) for part in (train_df, valid_df, test_df))
    params = dict(objective="regression_l1", learning_rate=0.04, n_estimators=2500, num_leaves=31,
                  min_child_samples=100, subsample=0.8, colsample_bytree=0.8, reg_lambda=5.0,
                  random_state=config.random_state, n_jobs=config.n_jobs,
                  subsample_freq=1, deterministic=True, force_col_wise=True, verbosity=-1)
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
    wind_domain = {"min": float(train_df.wind_speed_100m.min()), "max": float(train_df.wind_speed_100m.max())}
    domain_columns = ["wind_speed_100m", "temperature_2m", "surface_pressure", "capacidade_instalada_mw", "disponibilidade"]
    saved_config = config.serializable()
    saved_config["start_utc"] = report["experiment"]["start"]
    metadata = {
        "model_version": config.model_version,
        "model_scope": config.scope,
        "approved": bool(approved),
        "approval_rule": "hybrid test MAE must be lower than physical baseline test MAE",
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "target": config.target,
        "training_config": saved_config,
        "features": FEATURE_COLUMNS,
        "feature_order": FEATURE_COLUMNS,
        "physical_curve": config.serializable()["physical_curve"],
        "split_periods": periods,
        "metrics": {"baseline_test": baseline_metrics, "hybrid_test": hybrid_metrics},
        "wind_speed_domain_ms": wind_domain,
        "input_domain": {c: {"min": float(train_df[c].min()), "max": float(train_df[c].max())} for c in domain_columns},
        "training_usina_ids": sorted(train_df.usina_id.unique().tolist()),
        "hybrid_interval_coverage_test": interval_coverage(test_df, intervals, config.physical_curve),
        "best_iteration": model.best_iteration_,
        "model_sha256": hashlib.sha256((artifact_dir / "model.txt").read_bytes()).hexdigest(),
        "test_snapshot_sha256": dataset_fingerprint(test_df, target_column),
        "dataset_sha256": dataset_fingerprint(dataset, target_column),
        "runtime_versions": {"python": platform.python_version(), "lightgbm": lgb.__version__, "numpy": np.__version__, "pandas": pd.__version__},
        "lightgbm_params": params,
        "data_snapshot": "SHA256 do dataset canônico (CSV com 9 algarismos significativos)",
    }
    (artifact_dir / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2, default=_json_default), encoding="utf-8")
    write_report(report, artifact_dir / "validation_report.json")
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Treina LightGBM residual do ClimaGrid.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--target", choices=ALLOWED_TARGETS)
    parser.add_argument("--config", type=Path)
    parser.add_argument("--processed", type=Path, default=Path("data/processed/hourly.csv"))
    parser.add_argument("--artifacts", type=Path, default=default_artifact_dir())
    args = parser.parse_args()
    config = load_config(args.config, args.target)
    config.target_column()
    raw = TabularDatasetAdapter().load(args.input)
    try:
        dataset, report = prepare_hourly_dataset(raw, config)
    except DatasetValidationError as exc:
        write_report(exc.report, args.artifacts / "validation_report.json")
        parser.exit(2, f"{exc}\n")
    _write_dataframe(dataset, args.processed)
    metadata = train(dataset, config, args.artifacts)
    (args.artifacts / "validation_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"artifact_dir": str(args.artifacts), "approved": metadata["approved"], "metrics": metadata["metrics"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
