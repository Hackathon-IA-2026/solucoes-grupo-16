"""Isolated historical experiment: fit observed ONS MW before a held-out month.

This module never changes the production Predictor or the potential model.
Historical ONS availability/reference are deliberately excluded from features.
"""
from __future__ import annotations

import argparse
import importlib.metadata
import json
import platform
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from ingestion.common.io import atomic_write_json, atomic_write_parquet, sha256_file
from ingestion.ons.observed import OBSERVED, cohort, keyed
from training.config import FeatureConfig, LightGBMConfig, PhysicalCurveConfig
from training.features import FEATURE_COLUMNS, add_features
from training.observed_metrics import metrics
from training.physical_curve import apply_physical_bounds, physical_power_mw


def prepare_features(snapshot: pd.DataFrame) -> pd.DataFrame:
    """Use only climate and installed capacity known at prediction time."""
    required = {"u100", "v100", "temperature_2m", "surface_pressure",
                "capacidade_instalada_mw", OBSERVED}
    missing = required - set(snapshot)
    if missing:
        raise ValueError(f"Snapshot incompleto: {sorted(missing)}")
    frame = keyed(snapshot, "snapshot")
    frame = frame.sort_values(["usina_id", "timestamp_utc"]).reset_index(drop=True)
    frame["disponibilidade"] = 1.0  # no ex-post ONS availability leakage
    values = [*required]
    valid = np.isfinite(frame[values].apply(pd.to_numeric, errors="coerce")).all(axis=1)
    valid &= frame.capacidade_instalada_mw.gt(0) & frame[OBSERVED].ge(0)
    valid &= np.hypot(frame.u100, frame.v100).le(50)
    if not valid.all():
        raise ValueError(f"Snapshot contém {int((~valid).sum())} linhas inválidas; audite antes do treino.")
    frame = add_features(frame, FeatureConfig(require_complete_history=False))
    frame["baseline_mw"] = physical_power_mw(
        frame.wind_speed_hub_m, frame.capacidade_instalada_mw, frame.disponibilidade,
        PhysicalCurveConfig(),
    )
    return frame


def run(train_snapshot: Path, test_snapshot: Path, catalog_path: Path, output_dir: Path,
        *, test_month: str = "2025-10") -> dict:
    if output_dir.exists():
        raise FileExistsError(f"Experimento imutável; saída já existe: {output_dir}")
    training = prepare_features(pd.read_parquet(train_snapshot))
    catalog = pd.read_parquet(catalog_path)
    located = catalog.assign(fully_located_row=(catalog.match_status.eq("matched")
                                                & catalog.latitude.notna() & catalog.longitude.notna()))
    complete = located.groupby("usina_id").fully_located_row.all()
    eligible = set(complete.index[complete])
    raw_test = pd.read_parquet(test_snapshot)
    excluded_test_rows = int((~raw_test.usina_id.isin(eligible)).sum())
    test = prepare_features(raw_test.loc[raw_test.usina_id.isin(eligible)].copy())
    local_month = test.timestamp_utc.dt.tz_convert("America/Sao_Paulo").dt.strftime("%Y-%m")
    if not local_month.eq(test_month).all():
        raise ValueError("Snapshot de teste contém instantes fora do mês local solicitado.")
    if training.timestamp_utc.max() >= test.timestamp_utc.min():
        raise ValueError("Treino e teste não são temporalmente separados.")
    times = training.timestamp_utc.drop_duplicates().sort_values()
    cutoff = times.iloc[int(len(times) * .8)]
    train, validation = training.loc[training.timestamp_utc.lt(cutoff)], training.loc[training.timestamp_utc.ge(cutoff)]
    if train.empty or validation.empty or test.empty:
        raise ValueError("Treino, validação e teste devem conter linhas.")
    config = LightGBMConfig(n_estimators=500)
    params = {**config.__dict__, "objective": "regression_l1", "random_state": 42,
              "n_jobs": 1, "subsample_freq": 1, "deterministic": True,
              "force_col_wise": True, "verbosity": -1}
    model = lgb.LGBMRegressor(**params)
    residual = lambda part: (part[OBSERVED] - part.baseline_mw) / part.capacidade_instalada_mw
    model.fit(train[FEATURE_COLUMNS], residual(train),
              eval_set=[(validation[FEATURE_COLUMNS], residual(validation))],
              eval_metric="mae", callbacks=[lgb.early_stopping(50, verbose=False)])
    test = test.copy()
    test["hibrido_previsto_mw"] = apply_physical_bounds(
        test.baseline_mw, model.predict(test[FEATURE_COLUMNS]) * test.capacidade_instalada_mw,
        test.wind_speed_hub_m, test.capacidade_instalada_mw, test.disponibilidade,
        PhysicalCurveConfig(),
    )
    detail = test[["usina_id", "timestamp_utc", "capacidade_instalada_mw", "baseline_mw",
                   "hibrido_previsto_mw", OBSERVED]].rename(columns={"baseline_mw": "curva_fisica_mw"})
    hourly = detail.groupby("timestamp_utc", as_index=False)[
        ["capacidade_instalada_mw", "curva_fisica_mw", "hibrido_previsto_mw", OBSERVED]
    ].sum()
    hourly["erro_hibrido_mw"] = hourly.hibrido_previsto_mw - hourly[OBSERVED]
    hourly["data_local"] = hourly.timestamp_utc.dt.tz_convert("America/Sao_Paulo").dt.strftime("%Y-%m-%d")
    daily = hourly.groupby("data_local", as_index=False)[
        ["capacidade_instalada_mw", "curva_fisica_mw", "hibrido_previsto_mw", OBSERVED]
    ].sum()
    daily["capacidade_instalada_mw"] /= hourly.groupby("data_local").size().to_numpy()
    daily["erro_hibrido_mwh"] = daily.hibrido_previsto_mw - daily[OBSERVED]
    daily["wape_dia"] = (hourly.assign(abs_error=hourly.erro_hibrido_mw.abs())
                         .groupby("data_local").abs_error.sum().to_numpy() / daily[OBSERVED].to_numpy())
    daily = daily.rename(columns={"curva_fisica_mw": "curva_fisica_mwh",
                                  "hibrido_previsto_mw": "hibrido_previsto_mwh",
                                  OBSERVED: "geracao_verificada_mwh"})
    train_plants, test_plants = set(training.usina_id), set(test.usina_id)
    report = {
        "schema_version": "climagrid-observed-monthly-hybrid-experiment-v1",
        "status": "exploratory_partial_cohort", "scientifically_approved": False,
        "target": OBSERVED, "test_month_local": test_month,
        "catalog": {"path": str(catalog_path.resolve()), "sha256": sha256_file(catalog_path),
                    "total_ons_groups": int(len(complete)), "fully_located_groups": int(complete.sum()),
                    "excluded_groups": sorted(complete.index[~complete].tolist()),
                    "excluded_test_snapshot_rows": excluded_test_rows},
        "train_snapshot": {"path": str(train_snapshot.resolve()), "sha256": sha256_file(train_snapshot)},
        "test_snapshot": {"path": str(test_snapshot.resolve()), "sha256": sha256_file(test_snapshot)},
        "training": {"rows": len(train), "hours": int(train.timestamp_utc.nunique()),
                     "start_utc": train.timestamp_utc.min().isoformat(), "end_utc": train.timestamp_utc.max().isoformat()},
        "validation": {"rows": len(validation), "hours": int(validation.timestamp_utc.nunique()),
                        "start_utc": validation.timestamp_utc.min().isoformat(), "end_utc": validation.timestamp_utc.max().isoformat()},
        "test_cohort": cohort(detail), "unseen_test_plants": sorted(test_plants - train_plants),
        "params": params, "best_iteration": int(model.best_iteration_),
        "features": FEATURE_COLUMNS, "historical_availability_used_as_feature": False,
        "observed_target_used_as_feature": False,
        "runtime_versions": {"python": platform.python_version(), **{
            name: importlib.metadata.version(name) for name in ("lightgbm", "pandas", "numpy", "pyarrow")}},
        "hourly_grid_total": {name: metrics(hourly[OBSERVED], hourly[name])
                              for name in ("curva_fisica_mw", "hibrido_previsto_mw")},
        "plant_hour": {name: metrics(detail[OBSERVED], detail[name])
                       for name in ("curva_fisica_mw", "hibrido_previsto_mw")},
        "limitations": ["ERA5 é reanálise histórica, não previsão meteorológica futura.",
                        "Coorte parcial CEG/ERA5; não representa toda a geração eólica NE.",
                        "Modelo experimental não substitui o Predictor servido.",
                        "Nenhuma convergência elétrica foi verificada no ANAREDE."],
    }
    output_dir.mkdir(parents=True, exist_ok=False)
    model.booster_.save_model(str(output_dir / "model.txt"))
    atomic_write_parquet(detail, output_dir / "previsoes_vs_ons.parquet")
    atomic_write_parquet(hourly, output_dir / "comparacao_horaria.parquet")
    daily.to_csv(output_dir / "comparacao_diaria.csv", index=False)
    report["outputs"] = {name: sha256_file(output_dir / name) for name in
                         ("model.txt", "previsoes_vs_ons.parquet", "comparacao_horaria.parquet", "comparacao_diaria.csv")}
    atomic_write_json(output_dir / "relatorio_experimento.json", report)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train-snapshot", required=True, type=Path)
    parser.add_argument("--test-snapshot", required=True, type=Path)
    parser.add_argument("--catalog", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--test-month", default="2025-10")
    args = parser.parse_args()
    report = run(args.train_snapshot, args.test_snapshot, args.catalog, args.output_dir,
                 test_month=args.test_month)
    print(json.dumps({k: report[k] for k in ("status", "test_cohort", "best_iteration", "hourly_grid_total")},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
