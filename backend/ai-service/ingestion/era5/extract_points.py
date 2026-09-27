"""Extract ERA5 hourly values at the nearest grid point for each plant."""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from ingestion.common.io import atomic_write_parquet, sha256_file, utc_now_iso
from ingestion.common.manifests import write_manifest


VARIABLE_ALIASES = {
    "u100": ("u100", "100m_u_component_of_wind"),
    "v100": ("v100", "100m_v_component_of_wind"),
    "temperature_2m": ("t2m", "temperature_2m", "2m_temperature"),
    "surface_pressure": ("sp", "surface_pressure"),
}


def haversine_km(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    radius_km = 6371.0088
    lat_a, lat_b = math.radians(latitude_a), math.radians(latitude_b)
    delta_lat = lat_b - lat_a
    delta_lon = math.radians(longitude_b - longitude_a)
    value = math.sin(delta_lat / 2) ** 2 + math.cos(lat_a) * math.cos(lat_b) * math.sin(delta_lon / 2) ** 2
    return 2 * radius_km * math.asin(math.sqrt(value))


def _import_xarray():
    try:
        import xarray as xr
    except ImportError as exc:  # pragma: no cover - depends on runtime package
        raise RuntimeError("Instale xarray e netCDF4 para processar os arquivos ERA5.") from exc
    return xr


def _coordinate_name(dataset: Any, options: tuple[str, ...]) -> str:
    for name in options:
        if name in dataset.coords or name in dataset.dims:
            return name
    raise ValueError(f"Coordenada ERA5 ausente; esperado um de {options}.")


def _variable_name(dataset: Any, aliases: tuple[str, ...]) -> str:
    for name in aliases:
        if name in dataset.data_vars:
            return name
    raise ValueError(f"Variável ERA5 ausente; esperado um de {aliases}.")


def _resolve_expver(data_array: Any) -> tuple[Any, Any]:
    """Prefer final expver=1 and fill only its gaps from expver=5."""
    if "expver" not in data_array.dims:
        return data_array, None
    values = [int(value) for value in np.asarray(data_array["expver"].values).tolist()]
    ordered = [value for value in (1, 5) if value in values] + [value for value in values if value not in {1, 5}]
    combined = None
    version = None
    for value in ordered:
        candidate = data_array.sel(expver=value, drop=True)
        if combined is None:
            combined = candidate
            version = candidate.notnull().astype("int16") * value
        else:
            use_candidate = combined.isnull() & candidate.notnull()
            combined = combined.combine_first(candidate)
            version = version.where(~use_candidate, value)
    return combined, version


def _normalize_longitude(value: float, grid: np.ndarray) -> float:
    if float(np.nanmin(grid)) >= 0 and value < 0:
        return value % 360
    if float(np.nanmax(grid)) <= 180 and value > 180:
        return ((value + 180) % 360) - 180
    return value


def extract_from_dataset(dataset: Any, plants: pd.DataFrame, *, source_file: str = "") -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    required = {"usina_id", "latitude", "longitude"}
    missing = sorted(required - set(plants.columns))
    if missing:
        raise ValueError(f"Campos ausentes no catálogo: {missing}")
    selected_plants = plants.copy()
    if "match_status" in selected_plants:
        selected_plants = selected_plants[selected_plants["match_status"].eq("matched")]
    selected_plants = selected_plants.dropna(subset=["usina_id", "latitude", "longitude"])
    if selected_plants.empty:
        raise ValueError("Nenhuma usina com localização válida foi fornecida.")

    time_name = _coordinate_name(dataset, ("valid_time", "time"))
    latitude_name = _coordinate_name(dataset, ("latitude", "lat"))
    longitude_name = _coordinate_name(dataset, ("longitude", "lon"))
    variable_names = {canonical: _variable_name(dataset, aliases) for canonical, aliases in VARIABLE_ALIASES.items()}
    arrays: dict[str, Any] = {}
    versions: dict[str, Any] = {}
    for canonical, source_name in variable_names.items():
        arrays[canonical], versions[canonical] = _resolve_expver(dataset[source_name])

    grid_latitudes = np.asarray(dataset[latitude_name].values, dtype=float)
    grid_longitudes = np.asarray(dataset[longitude_name].values, dtype=float)
    weather_frames: list[pd.DataFrame] = []
    mapping_records: list[dict] = []

    timestamps = pd.to_datetime(dataset[time_name].values, utc=True)
    weighted_columns = [
        "u100", "v100", "temperature_2m", "surface_pressure",
        "era5_grid_latitude", "era5_grid_longitude", "era5_distance_km",
    ]

    # A full month can contain hundreds of catalog members. Expanding all of
    # them at once and repeatedly merging the weighted columns exceeded the
    # memory available to the Render Free service. Aggregate one ONS group at
    # a time so the largest intermediate frame is only members-in-group x
    # hours, while preserving the same capacity-weighted result.
    for _, plant_group in selected_plants.groupby("usina_id", sort=False):
        member_frames: list[pd.DataFrame] = []
        for plant in plant_group.itertuples(index=False):
            location_id = str(getattr(plant, "location_id", plant.usina_id))
            plant_latitude = float(plant.latitude)
            plant_longitude = float(plant.longitude)
            comparable_longitude = _normalize_longitude(plant_longitude, grid_longitudes)
            lat_index = int(np.nanargmin(np.abs(grid_latitudes - plant_latitude)))
            lon_index = int(np.nanargmin(np.abs(grid_longitudes - comparable_longitude)))
            grid_latitude = float(grid_latitudes[lat_index])
            grid_longitude_raw = float(grid_longitudes[lon_index])
            grid_longitude = ((grid_longitude_raw + 180) % 360) - 180
            distance = haversine_km(
                plant_latitude, plant_longitude, grid_latitude, grid_longitude
            )
            plant_frame = pd.DataFrame({"timestamp_utc": timestamps})
            expver_values: np.ndarray | None = None
            for canonical, data_array in arrays.items():
                point = data_array.isel(
                    {latitude_name: lat_index, longitude_name: lon_index}
                )
                values = np.asarray(point.values).reshape(-1)
                if len(values) != len(timestamps):
                    raise ValueError(
                        f"Dimensões inesperadas em {canonical}: {point.dims}"
                    )
                plant_frame[canonical] = values
                version_array = versions[canonical]
                if version_array is not None and expver_values is None:
                    expver_values = np.asarray(
                        version_array.isel(
                            {latitude_name: lat_index, longitude_name: lon_index}
                        ).values
                    ).reshape(-1)
            plant_frame.insert(0, "usina_id", str(plant.usina_id))
            plant_frame.insert(1, "location_id", location_id)
            capacity = float(getattr(plant, "capacidade_instalada_mw", 1.0))
            plant_frame["capacity_weight"] = (
                capacity if np.isfinite(capacity) and capacity > 0 else 1.0
            )
            plant_frame["era5_grid_latitude"] = grid_latitude
            plant_frame["era5_grid_longitude"] = grid_longitude
            plant_frame["era5_distance_km"] = distance
            plant_frame["era5_source_file"] = source_file
            plant_frame["era5_expver"] = (
                expver_values if expver_values is not None else pd.NA
            )
            relationship_start = getattr(plant, "relationship_start", pd.NaT)
            relationship_end = getattr(plant, "relationship_end", pd.NaT)
            if pd.notna(relationship_start):
                start_value = pd.Timestamp(relationship_start)
                start = (
                    start_value.tz_localize("UTC")
                    if start_value.tzinfo is None
                    else start_value.tz_convert("UTC")
                )
                plant_frame = plant_frame[plant_frame["timestamp_utc"] >= start]
            if pd.notna(relationship_end):
                end_value = pd.Timestamp(relationship_end)
                end = (
                    end_value.tz_localize("UTC")
                    if end_value.tzinfo is None
                    else end_value.tz_convert("UTC")
                ) + pd.Timedelta(days=1)
                plant_frame = plant_frame[plant_frame["timestamp_utc"] < end]
            member_frames.append(plant_frame)
            mapping_records.append({
                "usina_id": str(plant.usina_id),
                "location_id": location_id,
                "latitude": plant_latitude,
                "longitude": plant_longitude,
                "era5_grid_latitude": grid_latitude,
                "era5_grid_longitude": grid_longitude,
                "era5_distance_km": distance,
                "capacidade_instalada_mw": (
                    capacity if np.isfinite(capacity) else np.nan
                ),
                "relationship_start": relationship_start,
                "relationship_end": relationship_end,
            })

        member_weather = pd.concat(member_frames, ignore_index=True)
        member_weather = member_weather.drop_duplicates(
            ["usina_id", "location_id", "timestamp_utc"], keep="last"
        )
        for column in weighted_columns:
            member_weather[f"__weighted_{column}"] = (
                member_weather[column] * member_weather["capacity_weight"]
            )
        member_weather["era5_expver"] = pd.to_numeric(
            member_weather["era5_expver"], errors="coerce"
        )
        aggregated = member_weather.groupby(
            ["usina_id", "timestamp_utc"], as_index=False, sort=False
        ).agg(
            __weight_sum=("capacity_weight", "sum"),
            **{
                f"__sum_{column}": (f"__weighted_{column}", "sum")
                for column in weighted_columns
            },
            era5_source_file=("era5_source_file", "first"),
            era5_expver=("era5_expver", "max"),
            era5_member_count=("location_id", "nunique"),
        )
        for column in weighted_columns:
            aggregated[column] = (
                aggregated.pop(f"__sum_{column}") / aggregated["__weight_sum"]
            )
        weather_frames.append(aggregated.drop(columns="__weight_sum"))

    weather = pd.concat(weather_frames, ignore_index=True)
    weather = weather[[
        "usina_id", "timestamp_utc", *weighted_columns,
        "era5_source_file", "era5_expver", "era5_member_count",
    ]]
    weather = weather.sort_values(["timestamp_utc", "usina_id"]).reset_index(drop=True)
    mapping = pd.DataFrame.from_records(mapping_records).drop_duplicates(
        ["usina_id", "location_id", "era5_grid_latitude", "era5_grid_longitude"]
    ).sort_values(["usina_id", "location_id"]).reset_index(drop=True)
    report = validate_weather(weather)
    report["grid_cells_used"] = int(mapping[["era5_grid_latitude", "era5_grid_longitude"]].drop_duplicates().shape[0])
    return weather, mapping, report


def validate_weather(weather: pd.DataFrame, expected_hours: int | None = None) -> dict:
    required = ["usina_id", "timestamp_utc", "u100", "v100", "temperature_2m", "surface_pressure", "era5_distance_km"]
    missing = [column for column in required if column not in weather]
    report: dict[str, Any] = {"rows": int(len(weather)), "missing_columns": missing}
    if missing:
        return report
    timestamps = pd.to_datetime(weather["timestamp_utc"], utc=True, errors="coerce")
    duplicate_count = int(weather.assign(timestamp_utc=timestamps).duplicated(["usina_id", "timestamp_utc"]).sum())
    numeric_nulls = {column: int(pd.to_numeric(weather[column], errors="coerce").isna().sum()) for column in required[2:]}
    u100 = pd.to_numeric(weather["u100"], errors="coerce")
    v100 = pd.to_numeric(weather["v100"], errors="coerce")
    temperature = pd.to_numeric(weather["temperature_2m"], errors="coerce")
    pressure = pd.to_numeric(weather["surface_pressure"], errors="coerce")
    unit_or_range_errors = {
        "wind_outside_0_50_ms": int((np.hypot(u100, v100) > 50).fillna(False).sum()),
        "temperature_outside_150_350_k": int((~temperature.between(150, 350) & temperature.notna()).sum()),
        "pressure_outside_50000_120000_pa": int((~pressure.between(50_000, 120_000) & pressure.notna()).sum()),
        "timestamp_not_on_hour": int(((timestamps.dt.minute != 0) | (timestamps.dt.second != 0)).fillna(False).sum()),
    }
    hours_per_plant = weather.assign(timestamp_utc=timestamps).groupby("usina_id")["timestamp_utc"].nunique()
    report.update({
        "plants": int(weather["usina_id"].nunique()),
        "period_start": None if timestamps.dropna().empty else timestamps.min().isoformat(),
        "period_end": None if timestamps.dropna().empty else timestamps.max().isoformat(),
        "invalid_timestamps": int(timestamps.isna().sum()),
        "duplicate_keys": duplicate_count,
        "numeric_nulls": numeric_nulls,
        "unit_or_range_errors": unit_or_range_errors,
        "hours_per_plant_min": int(hours_per_plant.min()) if not hours_per_plant.empty else 0,
        "hours_per_plant_max": int(hours_per_plant.max()) if not hours_per_plant.empty else 0,
        "expected_hours": expected_hours,
    })
    if expected_hours:
        report["coverage_min"] = float(hours_per_plant.min() / expected_hours) if not hours_per_plant.empty else 0.0
    coverage_valid = not expected_hours or report["coverage_min"] >= 0.99
    report["valid"] = (
        not missing
        and duplicate_count == 0
        and report["invalid_timestamps"] == 0
        and all(value == 0 for value in numeric_nulls.values())
        and all(value == 0 for value in unit_or_range_errors.values())
        and coverage_valid
    )
    return report


def extract_file(
    source: Path,
    plants: pd.DataFrame,
    output: Path,
    manifest_path: Path,
    *,
    expected_hours: int | None = None,
    request_hash: str | None = None,
    catalog_hash: str | None = None,
) -> dict:
    xr = _import_xarray()
    with xr.open_dataset(source) as dataset:
        weather, mapping, report = extract_from_dataset(dataset, plants, source_file=str(source))
    report = validate_weather(weather, expected_hours=expected_hours) | {"grid_cells_used": int(mapping[["era5_grid_latitude", "era5_grid_longitude"]].drop_duplicates().shape[0])}
    if not report.get("valid"):
        raise ValueError(f"Partição ERA5 inválida: {report}")
    weather["era5_request_hash"] = request_hash or ""
    atomic_write_parquet(weather, output)
    manifest = {
        "status": "completed",
        "processed_at": utc_now_iso(),
        "source_path": str(source),
        "source_sha256": sha256_file(source),
        "output_path": str(output),
        "output_sha256": sha256_file(output),
        "request_hash": request_hash,
        "catalog_hash": catalog_hash,
        "quality": report,
        "grid_mapping": json.loads(mapping.to_json(orient="records", date_format="iso")),
    }
    write_manifest(manifest_path, manifest)
    return manifest
