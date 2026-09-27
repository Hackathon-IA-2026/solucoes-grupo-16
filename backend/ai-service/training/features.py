"""Feature engineering used identically by the offline pipeline and API."""
from __future__ import annotations

import numpy as np
import pandas as pd

from training.config import FeatureConfig


LEGACY_FEATURE_COLUMNS = [
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

FEATURE_COLUMNS = [
    "wind_speed_100m",
    "wind_speed_hub_m",
    "most_applied",
    "most_missing",
    *LEGACY_FEATURE_COLUMNS[1:],
    "wind_speed_mean_3h",
    "wind_speed_std_3h",
    "u_mean_3h",
    "v_mean_3h",
    "history_complete_3h",
    "wind_speed_mean_6h",
    "wind_speed_std_6h",
    "u_mean_6h",
    "v_mean_6h",
    "history_complete_6h",
    "wind_speed_gradient_1h",
    "wind_speed_gradient_3h",
    "wind_speed_gradient_6h",
    "temporal_context_complete",
]


def _psi_m(zeta: np.ndarray) -> np.ndarray:
    """Businger-Dyer momentum stability correction."""
    result = np.zeros_like(zeta, dtype=float)
    stable = zeta > 0
    result[stable] = -5.0 * zeta[stable]
    unstable = zeta < 0
    if unstable.any():
        x = np.power(1.0 - 16.0 * zeta[unstable], 0.25)
        result[unstable] = (2.0 * np.log((1.0 + x) / 2.0)
                            + np.log((1.0 + x * x) / 2.0)
                            - 2.0 * np.arctan(x) + np.pi / 2.0)
    return result


def _most_wind(speed_100m: pd.Series, frame: pd.DataFrame,
               config: FeatureConfig) -> tuple[pd.Series, pd.Series]:
    optional = {
        name: pd.to_numeric(frame[name], errors="coerce") if name in frame else pd.Series(np.nan, index=frame.index)
        for name in ("hub_height_m", "surface_roughness_m", "monin_obukhov_length_m")
    }
    hub, roughness, length = (optional[name] for name in optional)
    valid = (hub.gt(roughness) & hub.between(10, 300) & roughness.gt(0)
             & roughness.lt(10) & length.ne(0) & np.isfinite(length))
    result = speed_100m.astype(float).copy()
    if config.most_enabled and valid.any():
        selected = valid.to_numpy()
        z_hub = hub.to_numpy(dtype=float)[selected]
        z0 = roughness.to_numpy(dtype=float)[selected]
        monin = length.to_numpy(dtype=float)[selected]
        neutral = np.abs(monin) >= config.most_neutral_length_m
        numerator = np.log(z_hub / z0)
        denominator = np.log(100.0 / z0)
        if (~neutral).any():
            idx = ~neutral
            numerator[idx] -= _psi_m(z_hub[idx] / monin[idx]) - _psi_m(z0[idx] / monin[idx])
            denominator[idx] -= _psi_m(100.0 / monin[idx]) - _psi_m(z0[idx] / monin[idx])
        ratios = numerator / denominator
        safe = np.isfinite(ratios) & (ratios > 0)
        positions = np.flatnonzero(selected)[safe]
        result.iloc[positions] = speed_100m.iloc[positions] * ratios[safe]
        applied = pd.Series(False, index=frame.index)
        applied.iloc[positions] = True
    else:
        applied = pd.Series(False, index=frame.index)
    return result, applied


def _exact_lag(values: pd.Series, plant: pd.Series, timestamp: pd.Series, hours: int) -> pd.Series:
    index = pd.MultiIndex.from_arrays([plant.astype(str), timestamp])
    lookup = pd.Series(values.to_numpy(), index=index)
    desired = pd.MultiIndex.from_arrays([plant.astype(str), timestamp - pd.Timedelta(hours=hours)])
    return pd.Series(lookup.reindex(desired).to_numpy(), index=values.index, dtype=float)


def add_features(frame: pd.DataFrame, config: FeatureConfig | None = None) -> pd.DataFrame:
    """Create only prediction-time-safe features; observed generation is never used."""
    config = config or FeatureConfig()
    df = frame.copy()
    timestamp = pd.to_datetime(df["timestamp_utc"], utc=True, errors="coerce")
    u100 = pd.to_numeric(df["u100"], errors="coerce")
    v100 = pd.to_numeric(df["v100"], errors="coerce")
    temperature = pd.to_numeric(
        df["temperature_2m"] if "temperature_2m" in df else pd.Series(np.nan, index=df.index),
        errors="coerce",
    )
    pressure = pd.to_numeric(
        df["surface_pressure"] if "surface_pressure" in df else pd.Series(np.nan, index=df.index),
        errors="coerce",
    )
    availability = pd.to_numeric(df["disponibilidade"], errors="coerce")

    df["wind_speed_100m"] = np.hypot(u100, v100)
    df["wind_speed_hub_m"], applied = _most_wind(df["wind_speed_100m"], df, config)
    df["most_applied"] = applied.astype("int8")
    df["most_missing"] = (config.most_enabled & ~applied).astype("int8")
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
    plant = df["usina_id"].astype(str) if "usina_id" in df else pd.Series("", index=df.index)
    lags: dict[int, tuple[pd.Series, pd.Series, pd.Series]] = {
        hour: (_exact_lag(df["wind_speed_hub_m"], plant, timestamp, hour),
               _exact_lag(u100, plant, timestamp, hour),
               _exact_lag(v100, plant, timestamp, hour))
        for hour in range(1, config.required_history_hours + 1)
    }
    for window in config.rolling_windows_hours:
        speed_values = pd.concat([df["wind_speed_hub_m"]]
                                 + [lags[hour][0] for hour in range(1, window)], axis=1)
        u_values = pd.concat([u100] + [lags[hour][1] for hour in range(1, window)], axis=1)
        v_values = pd.concat([v100] + [lags[hour][2] for hour in range(1, window)], axis=1)
        complete = speed_values.notna().all(axis=1) & u_values.notna().all(axis=1) & v_values.notna().all(axis=1)
        df[f"wind_speed_mean_{window}h"] = speed_values.mean(axis=1).where(complete)
        df[f"wind_speed_std_{window}h"] = speed_values.std(axis=1, ddof=0).where(complete)
        df[f"u_mean_{window}h"] = u_values.mean(axis=1).where(complete)
        df[f"v_mean_{window}h"] = v_values.mean(axis=1).where(complete)
        df[f"history_complete_{window}h"] = complete.astype("int8")
    for hours in (1, 3, 6):
        df[f"wind_speed_gradient_{hours}h"] = (df["wind_speed_hub_m"] - lags[hours][0]) / hours
    required = [df[f"history_complete_{window}h"].eq(1) for window in config.rolling_windows_hours]
    required.extend(df[f"wind_speed_gradient_{hours}h"].notna() for hours in (1, 3, 6))
    df["temporal_context_complete"] = np.logical_and.reduce(required).astype("int8")
    return df


def feature_matrix(frame: pd.DataFrame, config: FeatureConfig | None = None) -> pd.DataFrame:
    enriched = add_features(frame, config)
    missing = [column for column in FEATURE_COLUMNS if column not in enriched]
    if missing:
        raise ValueError(f"Features não calculadas: {missing}")
    return enriched.loc[:, FEATURE_COLUMNS]
