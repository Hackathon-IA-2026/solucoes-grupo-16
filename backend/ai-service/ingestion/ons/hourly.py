"""Aggregate half-hour ONS power records and join them to ERA5 observations."""
from __future__ import annotations

from zoneinfo import ZoneInfo

import pandas as pd


ONS_VALUE_COLUMNS = {
    "val_disponibilidade": "disponibilidade_mw",
    "val_geracaoreferencia": "geracao_referencia_mw",
    "val_geracao": "geracao_verificada_mw",
}


def _numeric(series: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(series):
        return pd.to_numeric(series, errors="coerce")
    text = series.astype("string").str.strip()
    comma = text.str.contains(",", na=False)
    text.loc[comma] = text.loc[comma].str.replace(".", "", regex=False).str.replace(",", ".", regex=False)
    return pd.to_numeric(text, errors="coerce")


def _timestamps_utc(series: pd.Series, source_timezone: str) -> pd.Series:
    parsed = pd.to_datetime(series, errors="coerce")
    if getattr(parsed.dt, "tz", None) is None:
        parsed = parsed.dt.tz_localize(ZoneInfo(source_timezone), ambiguous="NaT", nonexistent="NaT")
    return parsed.dt.tz_convert("UTC")


def prepare_ons_hourly(
    frame: pd.DataFrame,
    catalog: pd.DataFrame,
    *,
    source_timezone: str = "America/Sao_Paulo",
    minimum_intervals: int = 2,
) -> tuple[pd.DataFrame, dict]:
    required = {"id_ons", "din_instante", *ONS_VALUE_COLUMNS}
    missing = sorted(required - set(frame.columns))
    if missing:
        raise ValueError(f"Campos ONS horários ausentes: {missing}")
    catalog_required = {"id_ons", "capacidade_instalada_mw"}
    missing_catalog = sorted(catalog_required - set(catalog.columns))
    if missing_catalog:
        raise ValueError(f"Campos ausentes no catálogo: {missing_catalog}")

    data = frame.copy()
    data["id_ons"] = data["id_ons"].astype("string").str.strip()
    data["timestamp_utc"] = _timestamps_utc(data["din_instante"], source_timezone)
    for source, target in ONS_VALUE_COLUMNS.items():
        data[target] = _numeric(data[source])
    invalid_timestamp_count = int(data["timestamp_utc"].isna().sum())
    data = data[data["timestamp_utc"].notna()].copy()
    invalid_interval = ~data["timestamp_utc"].dt.minute.isin([0, 30])
    invalid_interval_count = int(invalid_interval.sum())
    data = data[~invalid_interval].copy()
    source_keys = ["id_ons", "timestamp_utc"]
    duplicated = data.duplicated(source_keys, keep=False)
    duplicate_rows = int(duplicated.sum())
    if duplicate_rows:
        value_columns = list(ONS_VALUE_COLUMNS.values())
        conflicting = data.loc[duplicated].groupby(source_keys, dropna=False)[value_columns].nunique(dropna=False)
        if (conflicting > 1).any(axis=None):
            raise ValueError("Há registros ONS conflitantes para a mesma usina e instante.")
        data = data.drop_duplicates(source_keys, keep="last")
    data["timestamp_hour"] = data["timestamp_utc"].dt.floor("h")
    aggregation = {target: "mean" for target in ONS_VALUE_COLUMNS.values()}
    aggregation["timestamp_utc"] = "count"
    hourly = data.groupby(["id_ons", "timestamp_hour"], as_index=False).agg(aggregation)
    hourly = hourly.rename(columns={"id_ons": "usina_id", "timestamp_hour": "timestamp_utc", "timestamp_utc": "interval_count"})
    capacity_columns = ["id_ons", "capacidade_instalada_mw"]
    for optional in ["location_id", "relationship_start", "relationship_end"]:
        if optional in catalog:
            capacity_columns.append(optional)
    capacity = catalog[capacity_columns].copy().rename(columns={"id_ons": "usina_id"})
    capacity["usina_id"] = capacity["usina_id"].astype("string").str.strip()
    if "location_id" not in capacity:
        capacity["location_id"] = capacity["usina_id"]
    expanded_capacity = hourly[["usina_id", "timestamp_utc"]].merge(capacity, on="usina_id", how="left")
    active = pd.Series(True, index=expanded_capacity.index)
    if "relationship_start" in expanded_capacity:
        relationship_start = pd.to_datetime(expanded_capacity["relationship_start"], utc=True, errors="coerce")
        active &= relationship_start.isna() | (expanded_capacity["timestamp_utc"] >= relationship_start)
    if "relationship_end" in expanded_capacity:
        relationship_end = pd.to_datetime(expanded_capacity["relationship_end"], utc=True, errors="coerce")
        active &= relationship_end.isna() | (expanded_capacity["timestamp_utc"] < relationship_end + pd.Timedelta(days=1))
    expanded_capacity = expanded_capacity.loc[active].drop_duplicates(["usina_id", "timestamp_utc", "location_id"])
    capacity_by_hour = expanded_capacity.groupby(["usina_id", "timestamp_utc"], as_index=False)["capacidade_instalada_mw"].sum(min_count=1)
    hourly = hourly.merge(capacity_by_hour, on=["usina_id", "timestamp_utc"], how="left", validate="one_to_one")
    hourly["disponibilidade"] = hourly["disponibilidade_mw"] / hourly["capacidade_instalada_mw"]
    hourly["hour_complete"] = hourly["interval_count"] >= minimum_intervals
    valid = (
        hourly["hour_complete"]
        & hourly["capacidade_instalada_mw"].gt(0)
        & hourly["disponibilidade"].between(0, 1.05)
    )
    report = {
        "rows_input": int(len(frame)),
        "invalid_timestamps": invalid_timestamp_count,
        "invalid_half_hour_intervals": invalid_interval_count,
        "duplicate_source_rows": duplicate_rows,
        "rows_hourly": int(len(hourly)),
        "rows_valid": int(valid.sum()),
        "incomplete_hours": int((~hourly["hour_complete"]).sum()),
        "missing_capacity": int(hourly["capacidade_instalada_mw"].isna().sum()),
        "availability_outside_tolerance": int((~hourly["disponibilidade"].between(0, 1.05) & hourly["disponibilidade"].notna()).sum()),
        "availability_clipped_to_one": int(hourly["disponibilidade"].between(1.0, 1.05, inclusive="right").sum()),
    }
    hourly = hourly.loc[valid].copy()
    hourly["disponibilidade"] = hourly["disponibilidade"].clip(upper=1.0)
    return hourly.sort_values(["timestamp_utc", "usina_id"]).reset_index(drop=True), report


def join_ons_era5(ons_hourly: pd.DataFrame, weather: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    keys = ["usina_id", "timestamp_utc"]
    left = ons_hourly.copy()
    right = weather.copy()
    for frame in (left, right):
        frame["usina_id"] = frame["usina_id"].astype("string")
        frame["timestamp_utc"] = pd.to_datetime(frame["timestamp_utc"], utc=True, errors="coerce")
    if left.duplicated(keys).any() or right.duplicated(keys).any():
        raise ValueError("A união exige chaves únicas em ONS e ERA5.")
    joined = left.merge(right, on=keys, how="inner", validate="one_to_one")
    report = {
        "ons_rows": int(len(left)),
        "era5_rows": int(len(right)),
        "joined_rows": int(len(joined)),
        "ons_join_coverage": float(len(joined) / len(left)) if len(left) else 0.0,
    }
    return joined.sort_values(["timestamp_utc", "usina_id"]).reset_index(drop=True), report
