"""Feature engineering used identically by the offline pipeline and API."""
from __future__ import annotations

import numpy as np
import pandas as pd


FEATURE_COLUMNS = [
    "wind_speed_100m",
    "wind_dir_sin",
    "wind_dir_cos",
    "air_density_kg_m3",
    "hour_sin",
    "hour_cos",
    "doy_sin",
    "doy_cos",
    "capacidade_instalada_mw",
    "disponibilidade",
    "temperature_2m_missing",
    "surface_pressure_missing",
    "disponibilidade_missing",
    "era5_distance_km",
    "era5_distance_known",
]


def add_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Create only prediction-time-safe features; observed generation is never used."""
    df = frame.copy()
    timestamp = pd.to_datetime(df["timestamp_utc"], utc=True, errors="coerce")
    u100 = pd.to_numeric(df["u100"], errors="coerce")
    v100 = pd.to_numeric(df["v100"], errors="coerce")
    temperature = pd.to_numeric(df["temperature_2m"], errors="coerce")
    pressure = pd.to_numeric(df["surface_pressure"], errors="coerce")
    availability = pd.to_numeric(df["disponibilidade"], errors="coerce")

    df["wind_speed_100m"] = np.hypot(u100, v100)
    direction = np.arctan2(u100, v100)
    df["wind_dir_sin"] = np.sin(direction)
    df["wind_dir_cos"] = np.cos(direction)
    df["air_density_kg_m3"] = pressure / (287.05 * temperature)
    df["hour_sin"] = np.sin(2 * np.pi * timestamp.dt.hour / 24)
    df["hour_cos"] = np.cos(2 * np.pi * timestamp.dt.hour / 24)
    df["doy_sin"] = np.sin(2 * np.pi * timestamp.dt.dayofyear / 365.25)
    df["doy_cos"] = np.cos(2 * np.pi * timestamp.dt.dayofyear / 365.25)
    df["capacidade_instalada_mw"] = pd.to_numeric(
        df["capacidade_instalada_mw"], errors="coerce"
    )
    df["disponibilidade"] = availability
    df["temperature_2m_missing"] = temperature.isna().astype("int8")
    df["surface_pressure_missing"] = pressure.isna().astype("int8")
    df["disponibilidade_missing"] = availability.isna().astype("int8")
    if "era5_distance_km" not in df:
        df["era5_distance_km"] = np.nan
    df["era5_distance_km"] = pd.to_numeric(df["era5_distance_km"], errors="coerce")
    df["era5_distance_known"] = df["era5_distance_km"].notna().astype("int8")
    return df


def feature_matrix(frame: pd.DataFrame) -> pd.DataFrame:
    enriched = add_features(frame)
    missing = [column for column in FEATURE_COLUMNS if column not in enriched]
    if missing:
        raise ValueError(f"Features não calculadas: {missing}")
    return enriched.loc[:, FEATURE_COLUMNS]
