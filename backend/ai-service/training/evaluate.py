"""Metrics and empirical uncertainty built only from validation residuals."""
from __future__ import annotations

from typing import Iterable
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import lightgbm as lgb


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
    working["wind_band"] = pd.cut(working["wind_speed_100m"], WIND_BINS, labels=WIND_LABELS, right=False)
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
    """Absolute-error percentiles; sparse wind bands use the global validation fallback."""
    errors = np.abs(validation["target_mw"] - validation["hybrid_mw"])
    global_quantiles = {"p05": float(np.quantile(errors, 0.05)), "p95": float(np.quantile(errors, 0.95)), "n": int(len(errors))}
    work = validation.copy()
    work["wind_band"] = pd.cut(work["wind_speed_100m"], WIND_BINS, labels=WIND_LABELS, right=False)
    bands = {}
    for label in WIND_LABELS:
        sample = work.loc[work["wind_band"] == label, "target_mw"]
        band_errors = np.abs(work.loc[work["wind_band"] == label, "target_mw"] - work.loc[work["wind_band"] == label, "hybrid_mw"])
        if len(sample) >= minimum_samples:
            bands[label] = {"p05": float(np.quantile(band_errors, 0.05)), "p95": float(np.quantile(band_errors, 0.95)), "n": int(len(sample)), "source": "wind_band"}
        else:
            bands[label] = {**global_quantiles, "source": "global_fallback"}
    return {"method": "percentis 5/95 do erro absoluto na validação; intervalo empírico, não garantia probabilística", "global": global_quantiles, "wind_bands": bands}


def main() -> None:
    """Evaluate an existing artifact against its untouched temporal test partition."""
    parser = argparse.ArgumentParser(description="Avalia um artefato no teste temporal ClimaGrid.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--target", required=True, choices=["geracao_referencia_mw", "geracao_verificada_mw"])
    parser.add_argument("--artifacts", type=Path, default=Path("artifacts/global/v1"))
    parser.add_argument("--output", type=Path, default=Path("artifacts/global/v1/evaluation_report.json"))
    args = parser.parse_args()
    # Local imports avoid a training/evaluation import cycle in library usage.
    from training.build_dataset import TabularDatasetAdapter, prepare_hourly_dataset
    from training.config import TrainingConfig
    from training.features import add_features, feature_matrix
    from training.physical_curve import apply_physical_bounds, physical_power_mw
    from training.train import temporal_split

    metadata = json.loads((args.artifacts / "metadata.json").read_text(encoding="utf-8"))
    if metadata.get("target") != args.target:
        raise ValueError("O target informado não corresponde ao registrado no artefato.")
    config = TrainingConfig(target=args.target)
    data, _ = prepare_hourly_dataset(TabularDatasetAdapter().load(args.input), config)
    prepared = add_features(data)
    prepared["target_mw"] = prepared[args.target]
    prepared["baseline_mw"] = physical_power_mw(prepared.wind_speed_100m, prepared.capacidade_instalada_mw, prepared.disponibilidade, config.physical_curve)
    _, _, test, periods = temporal_split(prepared)
    model = lgb.Booster(model_file=str(args.artifacts / "model.txt"))
    correction = model.predict(feature_matrix(test)) * test.capacidade_instalada_mw
    test["hybrid_mw"] = apply_physical_bounds(test.baseline_mw, correction, test.wind_speed_100m, test.capacidade_instalada_mw, test.disponibilidade, config.physical_curve)
    report = {
        "split_periods": periods,
        "baseline_test": metrics_by_wind_and_plant(test.assign(prediction_mw=test.baseline_mw), "prediction_mw"),
        "hybrid_test": metrics_by_wind_and_plant(test, "hybrid_mw"),
        "note": "Avaliação no bloco de teste temporal. Não use este resultado para early stopping.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
