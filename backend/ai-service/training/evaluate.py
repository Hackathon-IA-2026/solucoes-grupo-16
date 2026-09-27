"""Metrics and empirical uncertainty built only from validation residuals."""
from __future__ import annotations

from typing import Iterable
import argparse
import json
import hashlib
from pathlib import Path

import numpy as np
import pandas as pd
import lightgbm as lgb
from training.config import PhysicalCurveConfig, default_artifact_dir
from training.physical_curve import apply_physical_bounds


WIND_BINS = [-np.inf, 3.0, 6.0, 9.0, 12.0, 25.0, np.inf]
WIND_LABELS = ["<3", "3-6", "6-9", "9-12", "12-25", ">=25"]


def regression_metrics(actual: Iterable[float], predicted: Iterable[float], capacity: Iterable[float]) -> dict:
    y = np.asarray(list(actual), dtype=float)
    yhat = np.asarray(list(predicted), dtype=float)
    cap = np.asarray(list(capacity), dtype=float)
    error = yhat - y
    absolute = np.abs(error)
    denominator = np.abs(y).sum()
    return {
        "mae_mw": float(absolute.mean()),
        "rmse_mw": float(np.sqrt(np.mean(error**2))),
        "nmae_cf": float(np.mean(absolute / cap)),
        "wape": None if denominator == 0 else float(absolute.sum() / denominator),
    }


def metrics_by_wind_and_plant(frame: pd.DataFrame, prediction_column: str) -> dict:
    working = frame.copy()
    wind_column = "wind_speed_hub_m" if "wind_speed_hub_m" in working else "wind_speed_100m"
    working["wind_band"] = pd.cut(working[wind_column], WIND_BINS, labels=WIND_LABELS, right=False)
    overall = regression_metrics(working.target_mw, working[prediction_column], working.capacidade_instalada_mw)
    by_wind = {
        str(name): regression_metrics(group.target_mw, group[prediction_column], group.capacidade_instalada_mw)
        for name, group in working.groupby("wind_band", observed=False) if len(group)
    }
    by_plant = {
        str(name): regression_metrics(group.target_mw, group[prediction_column], group.capacidade_instalada_mw)
        for name, group in working.groupby("usina_id") if len(group)
    }
    return {"overall": overall, "by_wind_band": by_wind, "by_usina": by_plant}


def empirical_interval_table(validation: pd.DataFrame, minimum_samples: int = 20) -> dict:
    """Signed errors in capacity factor, so both quantiles define the interval."""
    errors = (validation["target_mw"] - validation["hybrid_mw"]) / validation.capacidade_instalada_mw
    global_quantiles = {"p05": float(np.quantile(errors, 0.05)), "p95": float(np.quantile(errors, 0.95)), "n": int(len(errors))}
    work = validation.copy()
    wind_column = "wind_speed_hub_m" if "wind_speed_hub_m" in work else "wind_speed_100m"
    work["wind_band"] = pd.cut(work[wind_column], WIND_BINS, labels=WIND_LABELS, right=False)
    bands = {}
    for label in WIND_LABELS:
        sample = work.loc[work["wind_band"] == label, "target_mw"]
        band_errors = errors.loc[work["wind_band"] == label]
        if len(sample) >= minimum_samples:
            bands[label] = {"p05": float(np.quantile(band_errors, 0.05)), "p95": float(np.quantile(band_errors, 0.95)), "n": int(len(sample)), "source": "wind_band"}
        else:
            bands[label] = {**global_quantiles, "band_n": int(len(sample)), "source": "global_fallback"}
    return {"method": "percentis 5/95 do erro assinado (target - previsão) em fator de capacidade na validação; intervalo empírico, não garantia probabilística", "unit": "capacity_factor", "global": global_quantiles, "wind_bands": bands}


def interval_bounds(prediction, wind, capacity, availability, table: dict,
                    curve: PhysicalCurveConfig) -> tuple[np.ndarray, np.ndarray]:
    bands = pd.cut(wind, WIND_BINS, labels=WIND_LABELS, right=False)
    quantiles = [table["wind_bands"].get(str(band), table["global"]) for band in bands]
    lower = apply_physical_bounds(prediction, np.array([q["p05"] for q in quantiles]) * capacity,
                                  wind, capacity, availability, curve)
    upper = apply_physical_bounds(prediction, np.array([q["p95"] for q in quantiles]) * capacity,
                                  wind, capacity, availability, curve)
    return lower, upper


def interval_coverage(frame: pd.DataFrame, table: dict, curve: PhysicalCurveConfig) -> dict:
    wind_column = "wind_speed_hub_m" if "wind_speed_hub_m" in frame else "wind_speed_100m"
    lower, upper = interval_bounds(frame.hybrid_mw.to_numpy(), frame[wind_column].to_numpy(),
                                   frame.capacidade_instalada_mw.to_numpy(), frame.disponibilidade.to_numpy(), table, curve)
    return {"fraction": float(np.mean((frame.target_mw >= lower) & (frame.target_mw <= upper))),
            "mean_width_mw": float(np.mean(upper - lower)), "rows": len(frame)}


def dataset_fingerprint(frame: pd.DataFrame, target: str) -> str:
    columns = ["usina_id", "timestamp_utc", "u100", "v100", "temperature_2m", "surface_pressure",
               "capacidade_instalada_mw", "disponibilidade", target]
    columns.extend(["era5_distance_km", "hub_height_m", "surface_roughness_m",
                    "monin_obukhov_length_m"])
    stable = frame.sort_values(["timestamp_utc", "usina_id"]).reindex(columns=columns)
    return hashlib.sha256(stable.to_csv(index=False, float_format="%.9g", lineterminator="\n").encode()).hexdigest()


def evaluate_artifact(data: pd.DataFrame, artifact_dir: Path) -> dict:
    from training.config import TrainingConfig
    from training.features import FEATURE_COLUMNS, LEGACY_FEATURE_COLUMNS, feature_matrix
    from training.train import _prepared

    metadata = json.loads((artifact_dir / "metadata.json").read_text(encoding="utf-8"))
    config = TrainingConfig.from_dict(metadata["training_config"], allow_legacy_target=True)
    if metadata["feature_order"] not in (FEATURE_COLUMNS, LEGACY_FEATURE_COLUMNS):
        raise ValueError("Ordem de features incompatível.")
    period = metadata["split_periods"]["test"]
    test_raw = data.loc[data.timestamp_utc.between(pd.Timestamp(period["start"]), pd.Timestamp(period["end"]))].copy()
    if len(test_raw) != period["rows"] or dataset_fingerprint(test_raw, config.target_column()) != metadata["test_snapshot_sha256"]:
        raise ValueError("Snapshot de teste diferente do registrado no artefato.")
    # Feature context is computed from the same immutable snapshot used by train;
    # only the recorded test rows are evaluated.
    prepared = _prepared(data, config.target_column(), config)
    test = prepared.loc[prepared.timestamp_utc.between(
        pd.Timestamp(period["start"]), pd.Timestamp(period["end"]))].copy()
    if hashlib.sha256((artifact_dir / "model.txt").read_bytes()).hexdigest() != metadata["model_sha256"]:
        raise ValueError("Modelo não corresponde ao metadata.")
    model = lgb.Booster(model_file=str(artifact_dir / "model.txt"))
    if model.feature_name() != metadata["feature_order"]:
        raise ValueError("Features do modelo incompatíveis.")
    matrix = feature_matrix(test, config.features).loc[:, metadata["feature_order"]]
    correction = model.predict(matrix, num_threads=config.n_jobs) * test.capacidade_instalada_mw
    test["hybrid_mw"] = apply_physical_bounds(test.baseline_mw, correction, test.wind_speed_hub_m,
                                             test.capacidade_instalada_mw, test.disponibilidade, config.physical_curve)
    table = json.loads((artifact_dir / "residual_quantiles.json").read_text(encoding="utf-8"))
    return {"split_periods": metadata["split_periods"],
            "baseline_test": metrics_by_wind_and_plant(test, "baseline_mw"),
            "hybrid_test": metrics_by_wind_and_plant(test, "hybrid_mw"),
            "hybrid_interval_coverage_test": interval_coverage(test, table, config.physical_curve),
            "note": "Teste original identificado por período e SHA256; não usado no early stopping."}


def main() -> None:
    """Evaluate an existing artifact against its untouched temporal test partition."""
    parser = argparse.ArgumentParser(description="Avalia um artefato no teste temporal ClimaGrid.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--target", required=True, choices=["geracao_referencia_mw"])
    parser.add_argument("--artifacts", type=Path, default=default_artifact_dir())
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    # Local imports avoid a training/evaluation import cycle in library usage.
    from training.build_dataset import TabularDatasetAdapter, prepare_hourly_dataset
    from training.config import TrainingConfig

    metadata = json.loads((args.artifacts / "metadata.json").read_text(encoding="utf-8"))
    if metadata.get("target") != args.target:
        raise ValueError("O target informado não corresponde ao registrado no artefato.")
    config = TrainingConfig.from_dict(metadata["training_config"], allow_legacy_target=True)
    data, _ = prepare_hourly_dataset(TabularDatasetAdapter().load(args.input), config)
    report = evaluate_artifact(data, args.artifacts)
    args.output = args.output or args.artifacts / "evaluation_report.json"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
