"""Collect and join the real ONS restriction target with ERA5 for an exploratory DML run."""
from __future__ import annotations

import argparse
from calendar import monthrange
from datetime import date
import json
from pathlib import Path

import pandas as pd

from ingestion.common.io import atomic_write_json, atomic_write_parquet, read_tabular, sha256_file
from ingestion.era5.cds_client import download_month
from ingestion.era5.config import ERA5Paths
from ingestion.era5.extract_points import extract_file
from ingestion.era5.request_planner import plan_requests
from ingestion.ons.hourly import join_ons_era5, prepare_ons_hourly
from ingestion.ons.source_client import download_ons_restriction
from ingestion.plants.catalog import calculate_bounds
from training.config import service_root


def _next_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def _ensure_sources(
    *, year: int, month: int, catalog: pd.DataFrame, data_root: Path,
    collect_missing: bool,
) -> tuple[Path, list[Path], list[dict]]:
    paths = ERA5Paths(data_root)
    restriction = (
        data_root / "raw" / "ons" / f"year={year}" / f"month={month:02d}"
        / f"RESTRICAO_COFF_EOLICA_{year}_{month:02d}.parquet"
    )
    collection: list[dict] = []
    if not restriction.exists():
        if not collect_missing:
            raise FileNotFoundError(
                f"Base de restrição ausente: {restriction}. Use --collect-missing."
            )
        collection.append(download_ons_restriction(restriction, year, month))

    next_year, next_month = _next_month(year, month)
    # O mês ONS está em America/Sao_Paulo e alcança as primeiras horas UTC do
    # mês seguinte. Partições ERA5 são mensais, portanto coletamos os dois meses completos.
    start = date(year, month, 1)
    end = date(next_year, next_month, monthrange(next_year, next_month)[1])
    bounds = calculate_bounds(catalog)
    requests = plan_requests(start, end, bounds)
    weather_paths: list[Path] = []
    for request in requests:
        is_primary_month = (request.year, request.month) == (year, month)
        operational_output = paths.weather_month(request.year, request.month)
        training_root = (
            data_root / "processed" / "training" / "era5"
            / f"year={request.year}" / f"month={request.month:02d}"
        )
        # The following UTC month is needed only for the final local ONS hours.
        # Keep this extraction separate: relationships may legitimately end
        # during that month, so a full-month operational coverage gate can fail.
        spillover_root = (
            data_root / "processed" / "training" / "era5-spillover"
            / f"year={request.year}" / f"month={request.month:02d}"
        )
        training_output = training_root / "weather_hourly.parquet"
        spillover_output = spillover_root / "weather_hourly.parquet"
        if operational_output.exists():
            output = operational_output
        elif training_output.exists():
            # A month already extracted as a scientific primary partition is
            # identical climate input when requested as the following-month
            # UTC spillover. Reuse it instead of duplicating extraction.
            output = training_output
        elif spillover_output.exists():
            # Conversely, a spillover produced by the previous local month can
            # become the next scientific primary month. Both use the same raw
            # ERA5 request, catalog and no operational full-vigency gate.
            output = spillover_output
        elif is_primary_month:
            # Scientific snapshots may cross relationship changes inside the
            # primary month. Keep their extraction outside the operational
            # partition, whose 99% per-plant gate assumes full-month vigency.
            output = training_output
        else:
            output = spillover_output
        weather_paths.append(output)
        if output.exists():
            continue
        if not collect_missing:
            raise FileNotFoundError(
                f"ERA5 processado ausente: {output}. Use --collect-missing com credencial CDS."
            )
        raw = paths.raw_month(request.year, request.month)
        download = download_month(
            request, raw, paths.raw_manifest(request.year, request.month),
            overwrite=False,
        )
        manifest = extract_file(
            raw, catalog, output,
            (
                training_root / "processed.json"
                if is_primary_month
                else spillover_root / "processed.json"
            ),
            expected_hours=None,
            request_hash=request.request_hash,
            catalog_hash=None,
        )
        collection.append({"era5_download": download, "era5_processed": manifest})
    return restriction, weather_paths, collection


def build_exploratory_snapshot(
    restriction: pd.DataFrame,
    weather: pd.DataFrame,
    catalog: pd.DataFrame,
    *,
    exclude_reference_above_available: bool = True,
) -> tuple[pd.DataFrame, dict]:
    """Build a transparent hackathon snapshot; this does not approve the target contract."""
    ons, ons_report = prepare_ons_hourly(restriction, catalog)
    joined, join_report = join_ons_era5(ons, weather)
    joined["available_capacity_mw"] = (
        joined["capacidade_instalada_mw"] * joined["disponibilidade"]
    )
    invalid_target = (
        joined["geracao_referencia_mw"].isna()
        | joined["geracao_referencia_mw"].lt(0)
        | joined["geracao_referencia_mw"].gt(joined["capacidade_instalada_mw"])
    )
    above_available = joined["geracao_referencia_mw"].gt(
        joined["available_capacity_mw"] + 1e-9
    )
    eligible = ~invalid_target
    if exclude_reference_above_available:
        eligible &= ~above_available
    excluded = ~eligible
    snapshot = joined.loc[eligible].copy()
    snapshot = snapshot.sort_values(["timestamp_utc", "usina_id"]).reset_index(drop=True)
    if snapshot.empty:
        raise ValueError("Nenhuma linha elegível restou no snapshot exploratório.")
    if snapshot.duplicated(["usina_id", "timestamp_utc"]).any():
        raise ValueError("Snapshot exploratório possui chaves usina-hora duplicadas.")
    report = {
        "schema_version": "climagrid-dml-exploratory-snapshot-v1",
        "scientific_status": "exploratory_not_approved",
        "target": "geracao_referencia_mw",
        "target_semantics": "ONS estimate of generation without limitation; pending domain approval",
        "ons": ons_report,
        "join": join_report,
        "eligibility": {
            "rows_joined": int(len(joined)),
            "invalid_target_or_above_installed_capacity": int(invalid_target.sum()),
            "reference_above_available_capacity": int(above_available.sum()),
            "rows_excluded_total": int(excluded.sum()),
            "exclusion_counts_overlap": True,
            "exclude_reference_above_available": exclude_reference_above_available,
            "rows_eligible": int(len(snapshot)),
        },
        "coverage": {
            "hours": int(snapshot["timestamp_utc"].nunique()),
            "plants": int(snapshot["usina_id"].nunique()),
            "start_utc": snapshot["timestamp_utc"].min().isoformat(),
            "end_utc": snapshot["timestamp_utc"].max().isoformat(),
        },
    }
    return snapshot, report


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Coleta ONS/ERA5 e materializa snapshot DML explicitamente exploratório."
    )
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--month", type=int, choices=range(1, 13), required=True)
    parser.add_argument("--catalog", type=Path, default=service_root() / "data/processed/reference/plant_locations.parquet")
    parser.add_argument("--data-root", type=Path, default=service_root() / "data")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--collect-missing", action="store_true")
    parser.add_argument("--retain-reference-above-availability", action="store_true")
    args = parser.parse_args()

    catalog = read_tabular(args.catalog)
    restriction_path, weather_paths, collection = _ensure_sources(
        year=args.year, month=args.month, catalog=catalog,
        data_root=args.data_root, collect_missing=args.collect_missing,
    )
    restriction = read_tabular(restriction_path)
    weather = pd.concat([read_tabular(path) for path in weather_paths], ignore_index=True)
    snapshot, report = build_exploratory_snapshot(
        restriction, weather, catalog,
        exclude_reference_above_available=not args.retain_reference_above_availability,
    )
    atomic_write_parquet(snapshot, args.output)
    report.update({
        "sources": {
            "restriction": {"path": str(restriction_path), "sha256": sha256_file(restriction_path)},
            "era5": [{"path": str(path), "sha256": sha256_file(path)} for path in weather_paths],
            "catalog": {"path": str(args.catalog), "sha256": sha256_file(args.catalog)},
        },
        "output": {"path": str(args.output), "sha256": sha256_file(args.output)},
        "collection_events": collection,
    })
    atomic_write_json(args.report, report)
    print(json.dumps({
        "status": report["scientific_status"],
        "output": report["output"],
        "coverage": report["coverage"],
        "join": report["join"],
        "eligibility": report["eligibility"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
