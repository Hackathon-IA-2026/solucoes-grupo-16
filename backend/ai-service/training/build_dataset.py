"""Explicit joined-snapshot adapter, UTC hourly preparation and quality reporting."""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Protocol

import numpy as np
import pandas as pd

from training.config import ALLOWED_TARGETS, ColumnConfig, TrainingConfig, load_config

KEY = ["usina_id", "timestamp_utc"]
NUMERIC = ["capacidade_instalada_mw", "disponibilidade", "u100", "v100", "temperature_2m", "surface_pressure"]
OPTIONAL_NUMERIC = ["era5_distance_km", "hub_height_m", "surface_roughness_m",
                    "monin_obukhov_length_m"]
AUDIT_NUMERIC = ["geracao_verificada_mw"]


class DatasetAdapter(Protocol):
    """Future ONS/ERA5/catalog adapters return an explicitly mapped snapshot."""
    def load(self, path: Path) -> pd.DataFrame: ...


class TabularDatasetAdapter:
    def load(self, path: Path) -> pd.DataFrame:
        if path.suffix.lower() == ".parquet":
            return pd.read_parquet(path)
        if path.suffix.lower() == ".csv":
            # Preserve IDs such as 001; numeric conversion belongs to validation.
            return pd.read_csv(path, dtype=str)
        raise ValueError("Use CSV ou Parquet já unido no formato configurado.")


class DatasetValidationError(ValueError):
    def __init__(self, message: str, report: dict):
        super().__init__(message)
        self.report = report


def canonicalize_columns(frame: pd.DataFrame, columns: ColumnConfig) -> pd.DataFrame:
    mapping = {value: key for key, value in asdict(columns).items() if value in frame.columns}
    result = frame.rename(columns=mapping).copy()
    if result.columns.duplicated().any():
        raise ValueError("Colunas duplicadas ou mapeamento ambíguo no snapshot.")
    return result


def utc_timestamps(values: pd.Series, source_timezone: str | None) -> pd.Series:
    def parse(value: object) -> pd.Timestamp:
        try:
            if pd.isna(value) or isinstance(value, (int, float)):
                return pd.NaT
            timestamp = pd.Timestamp(value)
            if timestamp.tzinfo is None:
                if source_timezone is None:
                    return pd.NaT
                timestamp = timestamp.tz_localize(source_timezone, ambiguous="NaT", nonexistent="NaT")
            return timestamp.tz_convert("UTC")
        except (ValueError, TypeError, OverflowError):
            return pd.NaT
    return pd.to_datetime(values.map(parse), utc=True)


def _period(timestamps: pd.Series) -> dict:
    timestamps = timestamps.dropna()
    return {"start": timestamps.min().isoformat() if len(timestamps) else None,
            "end": timestamps.max().isoformat() if len(timestamps) else None}


def _inspect(frame: pd.DataFrame, config: TrainingConfig) -> tuple[pd.DataFrame, dict, dict]:
    df = canonicalize_columns(frame, config.columns)
    numeric = NUMERIC + ([config.target] if config.target else [])
    required = KEY + numeric
    missing = [column for column in required if column not in df]
    report = {
        "rows_input": len(df), "columns_found": list(frame.columns),
        "canonical_columns": list(df.columns), "column_mapping": asdict(config.columns),
        "expected_columns": required, "missing_required_columns": missing,
        "target": config.target,
        "target_contract": "ONS geracao_referencia_mw; proxy escolhida para geração sem limitação",
        "target_semantics_validated": False,
        "source_timezone": config.source_timezone, "logical_key": KEY,
        "null_rate": {c: float(df[c].isna().mean()) if len(df) else 0.0 for c in df},
        "exclusions": {}, "warnings": [],
    }
    if missing:
        report["status"] = "invalid"
        return df, report, {}
    df["timestamp_utc"] = utc_timestamps(df.timestamp_utc, config.source_timezone)
    df["usina_id"] = df.usina_id.astype("string").str.strip().replace("", pd.NA)
    present_optional = [column for column in OPTIONAL_NUMERIC if column in df]
    present_audit = [column for column in AUDIT_NUMERIC if column in df and column != config.target]
    numeric = numeric + present_optional + present_audit
    for column in numeric:
        df[column] = pd.to_numeric(df[column], errors="coerce")
    reasons = {"missing_usina_id": df.usina_id.isna(), "invalid_or_naive_timestamp": df.timestamp_utc.isna()}
    for column in numeric:
        report["null_rate"][column] = float(df[column].isna().mean()) if len(df) else 0.0
        if column not in OPTIONAL_NUMERIC and column not in AUDIT_NUMERIC:
            reasons[f"missing_or_nonfinite_{column}"] = ~np.isfinite(df[column])
    reasons.update({
        "capacity_not_positive": df.capacidade_instalada_mw <= 0,
        "availability_outside_0_1": ~df.disponibilidade.between(0, 1),
        "wind_outside_0_50_ms": ~np.hypot(df.u100, df.v100).between(0, 50),
        "temperature_outside_150_350_K": ~df.temperature_2m.between(150, 350),
        "pressure_outside_50000_120000_Pa": ~df.surface_pressure.between(50_000, 120_000),
    })
    if config.target:
        reasons["negative_target"] = df[config.target] < 0
        reasons["target_above_installed_capacity"] = df[config.target] > df.capacidade_instalada_mw
        report["target_above_installed_capacity"] = int((df[config.target] > df.capacidade_instalada_mw).sum())
        report["target_above_available_capacity"] = int((df[config.target] > df.capacidade_instalada_mw * df.disponibilidade).sum())
        report["target_clipped"] = False
        report["warnings"].append(
            "geracao_referencia_mw é proxy de geração sem limitação; semântica e filtros exigem aprovação ONS."
        )
    report["observed_generation"] = {
        "column": "geracao_verificada_mw" if "geracao_verificada_mw" in df else None,
        "purpose": "replay/audit_only",
        "used_as_target_or_feature": False,
    }
    if "era5_distance_km" in df:
        reasons["invalid_era5_distance"] = df.era5_distance_km.notna() & (~np.isfinite(df.era5_distance_km) | (df.era5_distance_km < 0))
    most_fields = ["hub_height_m", "surface_roughness_m", "monin_obukhov_length_m"]
    if config.features.most_required:
        missing_most = [column for column in most_fields if column not in df]
        if missing_most:
            report["missing_required_columns"].extend(missing_most)
            report["status"] = "invalid"
            return df, report, reasons
        reasons.update({
            "invalid_hub_height_m": ~df.hub_height_m.between(10, 300),
            "invalid_surface_roughness_m": ~df.surface_roughness_m.gt(0) | ~df.surface_roughness_m.lt(10),
            "invalid_monin_obukhov_length_m": ~np.isfinite(df.monin_obukhov_length_m) | df.monin_obukhov_length_m.eq(0),
        })
    duplicates = df.duplicated(KEY, keep=False) & df[KEY].notna().all(axis=1)
    reasons["duplicate_logical_key_rows"] = duplicates
    report["duplicate_logical_keys"] = int(df.loc[duplicates].duplicated(KEY).sum())
    report["invalid_values"] = {name: int(mask.sum()) for name, mask in reasons.items()}
    report["period_utc"] = _period(df.timestamp_utc)
    return df, report, reasons


def validate_dataset(frame: pd.DataFrame, config: TrainingConfig) -> dict:
    return _inspect(frame, config)[1]


def prepare_hourly_dataset(frame: pd.DataFrame, config: TrainingConfig) -> tuple[pd.DataFrame, dict]:
    df, report, reasons = _inspect(frame, config)
    if report["missing_required_columns"]:
        raise DatasetValidationError(f"Campos ausentes: {report['missing_required_columns']}", report)
    selected = pd.Series(True, index=df.index)
    if config.usina_id is not None:
        selected &= df.usina_id.eq(config.usina_id).fillna(False)
    plants = df.loc[selected, "usina_id"].dropna().unique()
    if len(plants) > 1 and not config.allow_multiple_plants:
        report["status"] = "invalid"
        raise DatasetValidationError("Fase 1 exige uma usina; configure usina_id para selecionar o experimento.", report)
    start = df.loc[selected, "timestamp_utc"].min()
    if config.start_utc:
        start = utc_timestamps(pd.Series([config.start_utc]), None).iloc[0]
        if pd.isna(start):
            raise DatasetValidationError("start_utc deve ter timezone válido.", report)
    if pd.notna(start):
        start = start.floor("h")
        end = start + pd.Timedelta(days=config.experiment_days)
        selected &= df.timestamp_utc.between(start, end, inclusive="left") | df.timestamp_utc.isna()
    report["exclusions"]["outside_experiment"] = int((~selected).sum())
    report["experiment"] = {"usina_id": list(map(str, plants)), "days": config.experiment_days,
                            "start": start.isoformat() if pd.notna(start) else None}
    bad = pd.Series(False, index=df.index)
    for reason, mask in reasons.items():
        bad |= mask.fillna(True)
        report["exclusions"][reason] = int((mask & selected).sum())
    # Do not average the remaining half-hour over missing target/availability.
    # Exclude the whole affected hour and account for this explicitly.
    df["timestamp_utc"] = df.timestamp_utc.dt.floor("h")
    bad_keys = pd.MultiIndex.from_frame(df.loc[selected & bad & df[KEY].notna().all(axis=1), KEY])
    bad_hour = pd.Series(pd.MultiIndex.from_frame(df[KEY]).isin(bad_keys), index=df.index)
    report["exclusions"]["additional_rows_in_invalid_hour"] = int((selected & ~bad & bad_hour).sum())
    clean = df.loc[selected & ~bad & ~bad_hour].copy()
    numeric = NUMERIC + ([config.target] if config.target else [])
    numeric += [column for column in OPTIONAL_NUMERIC + AUDIT_NUMERIC if column in clean
                and column not in numeric]
    hourly = clean.groupby(KEY, as_index=False)[numeric].mean().sort_values(KEY[::-1]).reset_index(drop=True)
    expected_hours = config.experiment_days * 24
    expected_plant_hours = expected_hours * max(1, len(plants))
    observed_hours = int(hourly["timestamp_utc"].nunique())
    report.update({
        "status": "valid" if len(hourly) else "invalid",
        "rows_after_validation": len(clean), "rows_excluded": len(df) - len(clean),
        "rows_hourly": len(hourly), "hourly_duplicate_keys": int(hourly.duplicated(KEY).sum()),
        "coverage": {"expected_hours": expected_hours, "observed_hours": observed_hours,
                     "missing_hours": expected_hours - observed_hours, "fraction": observed_hours / expected_hours,
                     "expected_plant_hours": expected_plant_hours, "observed_plant_hours": len(hourly),
                     "plant_hour_fraction": len(hourly) / expected_plant_hours},
        "hourly_period_utc": _period(hourly.timestamp_utc),
        "aggregation": "UTC hour, arithmetic mean of MW and climate; no gap filling; reject whole invalid hours",
        "exclusion_counts_overlap": True,
    })
    if len(hourly) < expected_plant_hours:
        report["warnings"].append("Cobertura incompleta; lacunas não foram imputadas.")
    if not len(hourly):
        raise DatasetValidationError("Nenhuma hora válida no experimento.", report)
    return hourly, report


def prepare_snapshot(frame: pd.DataFrame, config: TrainingConfig) -> tuple[pd.DataFrame, dict]:
    """Validate/consolidate a reusable snapshot without selecting protocol dates.

    This is the v1 temporal-protocol entry point.  The legacy
    ``prepare_hourly_dataset`` deliberately retains its experiment window for
    reproducibility of old artifacts.
    """
    neutral = TrainingConfig.from_dict({**config.serializable(), "start_utc": None,
                                        "experiment_days": 365000})
    df, report, reasons = _inspect(frame, neutral)
    if report["missing_required_columns"]:
        raise DatasetValidationError(f"Campos ausentes: {report['missing_required_columns']}", report)
    bad = pd.Series(False, index=df.index)
    for reason, mask in reasons.items():
        bad |= mask.fillna(True)
        report["exclusions"][reason] = int(mask.sum())
    df["timestamp_utc"] = df.timestamp_utc.dt.floor("h")
    valid_keys = df[KEY].notna().all(axis=1)
    bad_keys = pd.MultiIndex.from_frame(df.loc[bad & valid_keys, KEY])
    bad_hour = pd.Series(pd.MultiIndex.from_frame(df[KEY]).isin(bad_keys), index=df.index)
    clean = df.loc[~bad & ~bad_hour].copy()
    numeric = NUMERIC + ([config.target] if config.target else [])
    numeric += [column for column in OPTIONAL_NUMERIC + AUDIT_NUMERIC if column in clean
                and column not in numeric]
    hourly = clean.groupby(KEY, as_index=False)[numeric].mean().sort_values(KEY[::-1]).reset_index(drop=True)
    report.update({
        "status": "valid" if len(hourly) else "invalid",
        "snapshot_contract": "reusable-hourly-snapshot-v1",
        "rows_after_validation": len(clean), "rows_excluded": len(df) - len(clean),
        "rows_hourly": len(hourly), "hourly_duplicate_keys": int(hourly.duplicated(KEY).sum()),
        "hourly_period_utc": _period(hourly.timestamp_utc),
        "coverage": {"observed_hours": int(hourly.timestamp_utc.nunique()),
                     "observed_plant_hours": len(hourly),
                     "denominator": "deferred_to_versioned_protocol_and_validity"},
        "aggregation": "UTC hour, arithmetic mean; no gap filling; reject whole invalid hours",
    })
    if not len(hourly):
        raise DatasetValidationError("Nenhuma hora válida no snapshot.", report)
    return hourly, report


def write_report(report: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")


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
    parser.add_argument("--target", choices=ALLOWED_TARGETS)
    parser.add_argument("--config", type=Path)
    args = parser.parse_args()
    try:
        dataset, report = prepare_hourly_dataset(TabularDatasetAdapter().load(args.input), load_config(args.config, args.target))
    except DatasetValidationError as exc:
        write_report(exc.report, args.report)
        parser.exit(2, f"{exc}\nRelatório: {args.report}\n")
    write_report(report, args.report)
    _write_dataframe(dataset, args.output)
    print(f"Dataset horário: {args.output} ({len(dataset)} linhas); relatório: {args.report}")


if __name__ == "__main__":
    main()
