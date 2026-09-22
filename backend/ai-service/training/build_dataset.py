"""Canonical adapter and quality report for incoming ONS/ERA5 joined data."""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Protocol

import numpy as np
import pandas as pd

from training.config import ColumnConfig, TrainingConfig


class DatasetAdapter(Protocol):
    def load(self, path: Path) -> pd.DataFrame: ...


class TabularDatasetAdapter:
    """Adapter for an already joined CSV/Parquet snapshot; no ONS field guessing."""

    def load(self, path: Path) -> pd.DataFrame:
        if path.suffix.lower() == ".parquet":
            return pd.read_parquet(path)
        if path.suffix.lower() == ".csv":
            return pd.read_csv(path)
        raise ValueError("Use um arquivo CSV ou Parquet já unido no formato configurado.")


def canonicalize_columns(frame: pd.DataFrame, columns: ColumnConfig) -> pd.DataFrame:
    mapping = {value: key for key, value in asdict(columns).items() if value in frame.columns}
    return frame.rename(columns=mapping).copy()


def validate_dataset(frame: pd.DataFrame, config: TrainingConfig) -> dict:
    df = canonicalize_columns(frame, config.columns)
    expected = [
        "usina_id", "timestamp_utc", "capacidade_instalada_mw", "disponibilidade",
        "u100", "v100", "temperature_2m", "surface_pressure",
    ]
    target = config.columns.target_name(config.target)
    if target:
        expected.append(target)
    found = [column for column in expected if column in df.columns]
    missing = [column for column in expected if column not in df.columns]
    report: dict = {
        "rows_input": int(len(df)),
        "columns_found": sorted(df.columns.tolist()),
        "expected_columns": expected,
        "missing_required_columns": missing,
        "null_rate": {column: float(df[column].isna().mean()) for column in found},
        "logical_key": ["usina_id", "timestamp_utc"],
        "exclusions": {},
    }
    if missing:
        return report
    timestamp = pd.to_datetime(df["timestamp_utc"], utc=True, errors="coerce")
    wind = np.hypot(pd.to_numeric(df["u100"], errors="coerce"), pd.to_numeric(df["v100"], errors="coerce"))
    capacity = pd.to_numeric(df["capacidade_instalada_mw"], errors="coerce")
    availability = pd.to_numeric(df["disponibilidade"], errors="coerce")
    invalid_timestamp = timestamp.isna()
    key = pd.DataFrame({"usina_id": df["usina_id"], "timestamp_utc": timestamp})
    report.update(
        {
            "duplicate_logical_keys": int(key.duplicated().sum()),
            "period_utc": {
                "start": None if timestamp.dropna().empty else timestamp.min().isoformat(),
                "end": None if timestamp.dropna().empty else timestamp.max().isoformat(),
            },
            "invalid_values": {
                "timestamp": int(invalid_timestamp.sum()),
                "capacity_not_positive": int((capacity <= 0).fillna(True).sum()),
                "availability_outside_0_1": int(((availability < 0) | (availability > 1)).fillna(False).sum()),
                "wind_outside_0_50_ms": int(((wind < 0) | (wind > 50)).fillna(False).sum()),
                "temperature_not_kelvin_positive": int((pd.to_numeric(df["temperature_2m"], errors="coerce") <= 0).fillna(False).sum()),
                "pressure_not_positive": int((pd.to_numeric(df["surface_pressure"], errors="coerce") <= 0).fillna(False).sum()),
            },
        }
    )
    if target:
        target_values = pd.to_numeric(df[target], errors="coerce")
        report["invalid_values"]["target_negative"] = int((target_values < 0).fillna(False).sum())
        report["invalid_values"]["target_above_installed_capacity"] = int(
            (target_values > capacity).fillna(False).sum()
        )
        report["null_rate"][target] = float(target_values.isna().mean())
    return report


def prepare_hourly_dataset(frame: pd.DataFrame, config: TrainingConfig) -> tuple[pd.DataFrame, dict]:
    """Convert to UTC, reject invalid rows, and consolidate to one hourly key."""
    report = validate_dataset(frame, config)
    if report["missing_required_columns"]:
        raise ValueError(f"Campos ausentes: {report['missing_required_columns']}")
    df = canonicalize_columns(frame, config.columns)
    df["timestamp_utc"] = pd.to_datetime(df["timestamp_utc"], utc=True, errors="coerce")
    numeric = ["capacidade_instalada_mw", "disponibilidade", "u100", "v100", "temperature_2m", "surface_pressure"]
    if "era5_distance_km" in df:
        numeric.append("era5_distance_km")
    target = config.columns.target_name(config.target)
    if target:
        numeric.append(target)
    for column in numeric:
        df[column] = pd.to_numeric(df[column], errors="coerce")
    wind = np.hypot(df["u100"], df["v100"])
    valid = (
        df["usina_id"].notna()
        & df["timestamp_utc"].notna()
        & (df["capacidade_instalada_mw"] > 0)
        & df["disponibilidade"].between(0, 1)
        & wind.between(0, 50)
        & (df["temperature_2m"] > 0)
        & (df["surface_pressure"] > 0)
    )
    if target:
        valid &= df[target].notna() & (df[target] >= 0) & (df[target] <= df["capacidade_instalada_mw"])
    report["exclusions"]["invalid_or_missing_required_values"] = int((~valid).sum())
    clean = df.loc[valid].copy()
    clean["timestamp_utc"] = clean["timestamp_utc"].dt.floor("h")
    aggregation = {column: "mean" for column in numeric if column in clean}
    hourly = clean.groupby(["usina_id", "timestamp_utc"], as_index=False).agg(aggregation)
    report["rows_after_validation"] = int(len(clean))
    report["rows_hourly"] = int(len(hourly))
    report["hourly_duplicate_keys"] = int(hourly.duplicated(["usina_id", "timestamp_utc"]).sum())
    return hourly.sort_values(["timestamp_utc", "usina_id"]).reset_index(drop=True), report


def _write_dataframe(frame: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() == ".parquet":
        frame.to_parquet(path, index=False)
    else:
        frame.to_csv(path, index=False)


def main() -> None:
    parser = argparse.ArgumentParser(description="Valida e consolida o snapshot horário ClimaGrid.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=Path("data/processed/hourly.csv"))
    parser.add_argument("--report", type=Path, default=Path("data/processed/validation_report.json"))
    parser.add_argument("--target", choices=["geracao_referencia_mw", "geracao_verificada_mw"])
    args = parser.parse_args()
    config = TrainingConfig(target=args.target)
    source = TabularDatasetAdapter().load(args.input)
    dataset, report = prepare_hourly_dataset(source, config)
    _write_dataframe(dataset, args.output)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Dataset horário: {args.output} ({len(dataset)} linhas)")
    print(f"Relatório de validação: {args.report}")


if __name__ == "__main__":
    main()
