"""Build an observed ONS/ERA5 replay partition when a historical hour is requested."""
from __future__ import annotations

import os
import argparse
import gc
import json
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

from ingestion.common.io import atomic_write_json, atomic_write_parquet, read_tabular, sha256_file
from ingestion.era5.cds_client import download_month
from ingestion.era5.config import ERA5Paths
from ingestion.era5.extract_points import extract_file
from ingestion.era5.request_planner import build_monthly_request
from ingestion.ons.hourly import (
    ONS_GENERATION_REQUIRED_COLUMNS,
    join_ons_era5,
    prepare_ons_generation_hourly,
)
from ingestion.ons.source_client import download_ons_generation, download_ons_membership
from ingestion.plants.catalog import (
    calculate_bounds, expand_ons_groups, load_ons_catalog,
    load_ons_membership, load_siga_catalog, reconcile_catalog,
)
from ingestion.plants.siga_client import download_siga


ONS_TIMEZONE = ZoneInfo("America/Sao_Paulo")
EARLIEST_ONS_MONTH = (2022, 1)
ONS_CATALOG_COLUMNS = (
    "ceg",
    "id_estado",
    "id_ons",
    "id_subsistema",
    "nom_tipousina",
    "nom_usina",
)


def replay_partition(data_root: Path, timestamp: pd.Timestamp) -> Path:
    local = timestamp.tz_convert(ONS_TIMEZONE)
    return (data_root / "processed" / "historical" / f"year={local.year:04d}"
            / f"month={local.month:02d}" / f"observations_utc_{timestamp.year:04d}-{timestamp.month:02d}.parquet")


def weather_partition(data_root: Path, timestamp: pd.Timestamp) -> Path:
    """Return the processed ERA5 partition used by an on-demand replay month."""
    output = replay_partition(data_root, timestamp)
    return (output.parent / f"utc={timestamp.year:04d}-{timestamp.month:02d}"
            / "weather_hourly.parquet")


def on_demand_configured() -> bool:
    return bool(os.getenv("CDSAPI_KEY") or (Path.home() / ".cdsapirc").is_file())


def validate_replay_date(timestamp: pd.Timestamp) -> None:
    local = timestamp.tz_convert(ONS_TIMEZONE)
    if (local.year, local.month) < EARLIEST_ONS_MONTH:
        raise ValueError("A coleta mensal de geração ONS está disponível a partir de janeiro de 2022.")
    if timestamp >= pd.Timestamp.now(tz="UTC").floor("h"):
        raise ValueError("Escolha uma hora histórica já encerrada; o replay não prevê datas futuras.")


def validate_era5_scenario_date(timestamp: pd.Timestamp) -> None:
    if (timestamp.year, timestamp.month) < EARLIEST_ONS_MONTH:
        raise ValueError("O cenário ERA5 do MVP aceita horas a partir de janeiro de 2022.")
    if timestamp >= pd.Timestamp.now(tz="UTC").floor("h"):
        raise ValueError("Escolha uma hora histórica já encerrada; ERA5 não prevê datas futuras.")


def prepare_era5_partition(
    data_root: Path, catalog_path: Path, timestamp: pd.Timestamp
) -> Path:
    """Download and extract ERA5 with the existing catalog, without requiring ONS generation."""
    timestamp = timestamp.tz_convert("UTC").floor("h")
    validate_era5_scenario_date(timestamp)
    if not on_demand_configured():
        raise RuntimeError("Configure CDSAPI_KEY ou ~/.cdsapirc no AI service para baixar o ERA5 histórico.")
    if not catalog_path.is_file():
        raise RuntimeError("O catálogo de usinas não está disponível para extrair o ERA5.")
    catalog = read_tabular(catalog_path)
    request = build_monthly_request(
        timestamp.year, timestamp.month, calculate_bounds(catalog)
    )
    paths = ERA5Paths(data_root)
    raw = paths.raw_month(timestamp.year, timestamp.month)
    raw_manifest = paths.raw_manifest(timestamp.year, timestamp.month)
    weather = paths.weather_month(timestamp.year, timestamp.month)
    processed_manifest = paths.processed_manifest(timestamp.year, timestamp.month)
    download_month(request, raw, raw_manifest)
    if not weather.is_file():
        extract_file(
            raw,
            catalog,
            weather,
            processed_manifest,
            request_hash=request.request_hash,
            catalog_hash=sha256_file(catalog_path),
        )
    return weather


def prepare_replay_partition(data_root: Path, timestamp: pd.Timestamp) -> Path:
    """Download only the needed ONS local month and ERA5 UTC month; validate before publishing."""
    timestamp = timestamp.tz_convert("UTC").floor("h")
    validate_replay_date(timestamp)
    local = timestamp.tz_convert(ONS_TIMEZONE)
    output = replay_partition(data_root, timestamp)
    if output.is_file():
        return output
    if not on_demand_configured():
        raise RuntimeError("Configure CDSAPI_KEY ou ~/.cdsapirc no AI service para baixar o ERA5 histórico.")

    ons_path = (data_root / "raw" / "ons" / f"year={local.year:04d}" / f"month={local.month:02d}"
                / f"GERACAO_USINA-2_{local.year:04d}_{local.month:02d}.parquet")
    ons_manifest = (data_root / "manifests" / "ons" / f"year={local.year:04d}"
                    / f"month={local.month:02d}" / "download.json")
    if not ons_path.is_file():
        atomic_write_json(ons_manifest, download_ons_generation(ons_path, local.year, local.month))

    siga_path = data_root / "raw" / "siga" / "siga.csv"
    membership_path = data_root / "raw" / "ons" / "relacionamento_usina_conjunto.parquet"
    if not siga_path.is_file():
        atomic_write_json(data_root / "manifests" / "siga.json", download_siga(siga_path))
    if not membership_path.is_file():
        atomic_write_json(data_root / "manifests" / "ons_membership.json",
                          download_ons_membership(membership_path))

    catalog_path = output.parent / "catalog.parquet"
    catalog_report_path = output.parent / "catalog_report.json"
    if catalog_path.is_file() and catalog_report_path.is_file():
        catalog = read_tabular(catalog_path)
        catalog_report = json.loads(catalog_report_path.read_text(encoding="utf-8"))
    else:
        ons_catalog_source = read_tabular(
            ons_path,
            columns=list(ONS_CATALOG_COLUMNS),
        )
        ons_catalog = load_ons_catalog(
            [ons_catalog_source], subsystem="NE", plant_type="EOL"
        )
        del ons_catalog_source
        gc.collect()
        membership = load_ons_membership(membership_path, subsystem="NE")
        expanded = expand_ons_groups(ons_catalog, membership)
        catalog, catalog_report = reconcile_catalog(expanded, load_siga_catalog(siga_path),
                                                    location_source=str(siga_path))
        if not catalog["match_status"].eq("matched").any():
            raise ValueError("Nenhum conjunto ONS pôde ser localizado no catálogo SIGA.")
        atomic_write_parquet(catalog, catalog_path)
        atomic_write_json(catalog_report_path, catalog_report)

    # Normalize the ONS source before opening the monthly NetCDF, then release
    # the much wider raw frame. Keeping both inputs expanded at the same time
    # can exceed the memory limit of the Render Free service.
    ons = read_tabular(
        ons_path,
        columns=sorted(ONS_GENERATION_REQUIRED_COLUMNS),
    )
    ons_hourly, ons_report = prepare_ons_generation_hourly(ons, catalog)
    ons_hourly = ons_hourly.loc[
        ons_hourly["timestamp_utc"].dt.year.eq(timestamp.year)
        & ons_hourly["timestamp_utc"].dt.month.eq(timestamp.month)
    ].copy()
    del ons
    gc.collect()

    bounds = calculate_bounds(catalog)
    request = build_monthly_request(timestamp.year, timestamp.month, bounds)
    suffix = f"utc={request.label}"
    raw = output.parent / suffix / "era5.nc"
    raw_manifest = output.parent / suffix / "era5_download.json"
    weather = weather_partition(data_root, timestamp)
    weather_manifest = output.parent / suffix / "weather_processed.json"
    download_month(request, raw, raw_manifest)
    catalog_hash = sha256_file(catalog_path)
    if not weather.is_file():
        # Relationships can start/end within a month. Validate all extracted values,
        # then require the selected hour explicitly below instead of 99% per-plant coverage.
        extract_file(raw, catalog, weather, weather_manifest, request_hash=request.request_hash,
                     catalog_hash=catalog_hash)
    del catalog
    gc.collect()

    weather_hourly = read_tabular(weather)
    joined, join_report = join_ons_era5(ons_hourly, weather_hourly)
    del weather_hourly
    selected_ons = ons_hourly.loc[ons_hourly["timestamp_utc"].eq(timestamp)].copy()
    del ons_hourly
    gc.collect()
    selected_joined = joined.loc[joined["timestamp_utc"].eq(timestamp)]
    if selected_ons.empty or selected_joined.empty:
        raise ValueError("A hora solicitada não possui geração ONS e vento ERA5 conciliados.")
    if joined.duplicated(["usina_id", "timestamp_utc"]).any():
        raise ValueError("A junção ONS–ERA5 produziu chaves usina–hora duplicadas.")
    selected_coverage = len(selected_joined) / len(selected_ons)
    report = {
        "requested_timestamp_utc": timestamp.isoformat(),
        "ons_month_local": f"{local.year:04d}-{local.month:02d}",
        "era5_month_utc": request.label,
        "ons_source": str(ons_path), "ons_sha256": sha256_file(ons_path),
        "era5_source": str(raw), "era5_sha256": sha256_file(raw),
        "catalog": str(catalog_path), "catalog_sha256": catalog_hash,
        "catalog_plant_coverage": catalog_report.get("plant_coverage"),
        "ons": ons_report, "join": join_report,
        "requested_hour_ons_rows": len(selected_ons),
        "requested_hour_joined_rows": len(selected_joined),
        "requested_hour_coverage": selected_coverage,
        "warnings": (["cobertura_ons_era5_parcial"] if selected_coverage < 1 else [])
                    + (["ha_conjuntos_sem_localizacao_completa"]
                       if catalog_report.get("plant_coverage", 1) < 1 else []),
    }
    atomic_write_json(output.with_name("join_report_" + suffix + ".json"), report)
    atomic_write_parquet(joined, output)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepara uma hora de replay ONS–ERA5 com cache mensal.")
    parser.add_argument("--timestamp", required=True, help="Hora histórica ISO com timezone.")
    parser.add_argument("--data-root", type=Path, default=Path(os.getenv("CLIMAGRID_DATA_ROOT", "data")))
    args = parser.parse_args()
    timestamp = pd.Timestamp(args.timestamp)
    if timestamp.tzinfo is None:
        parser.error("--timestamp precisa conter timezone.")
    path = prepare_replay_partition(args.data_root, timestamp)
    print(json.dumps({"snapshot": str(path), "timestamp_utc": timestamp.tz_convert("UTC").isoformat()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
