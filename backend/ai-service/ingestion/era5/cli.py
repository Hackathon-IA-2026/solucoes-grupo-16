"""Command-line entry point for the ClimaGrid ERA5 ingestion workflow."""
from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from ingestion.common.io import atomic_write_json, atomic_write_parquet, read_tabular, stable_hash
from ingestion.common.manifests import read_manifest
from ingestion.era5.cds_client import download_month
from ingestion.era5.config import ERA5Paths
from ingestion.era5.extract_points import extract_file, validate_weather
from ingestion.era5.request_planner import MonthlyRequest, plan_requests
from ingestion.ons.hourly import (
    join_ons_era5,
    prepare_ons_generation_hourly,
    prepare_ons_hourly,
)
from ingestion.ons.source_client import download_ons_generation, download_ons_membership
from ingestion.pwf.mapping import build_pwf_bus_mapping
from ingestion.plants.catalog import (
    calculate_bounds,
    expand_ons_groups,
    load_ons_catalog,
    load_ons_membership,
    load_siga_catalog,
    reconcile_catalog,
)
from ingestion.plants.siga_client import download_siga


def _date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("Use data no formato AAAA-MM-DD.") from exc


def _load_many(paths: list[Path]) -> pd.DataFrame:
    frames = [read_tabular(path) for path in paths]
    if not frames:
        raise ValueError("Nenhum arquivo foi informado.")
    return pd.concat(frames, ignore_index=True)


def _request_json(request: MonthlyRequest) -> dict:
    return {
        "label": request.label,
        "dataset": request.dataset,
        "payload": request.payload,
        "request_hash": request.request_hash,
        "expected_hours": request.expected_hours,
    }


def _catalog_and_requests(catalog_path: Path, start: date, end: date):
    catalog = read_tabular(catalog_path)
    bounds = calculate_bounds(catalog)
    return catalog, bounds, plan_requests(start, end, bounds)


def command_download_siga(args: argparse.Namespace) -> None:
    result = download_siga(args.output, source_url=args.source_url)
    atomic_write_json(args.manifest, result)
    print(json.dumps(result, ensure_ascii=False, indent=2))


def command_download_ons_membership(args: argparse.Namespace) -> None:
    result = download_ons_membership(args.output, source_url=args.source_url)
    atomic_write_json(args.manifest, result)
    print(json.dumps(result, ensure_ascii=False, indent=2))


def command_download_ons_generation(args: argparse.Namespace) -> None:
    output = args.output or (
        ERA5Paths().root
        / "raw"
        / "ons"
        / f"year={args.year}"
        / f"month={args.month:02d}"
        / f"GERACAO_USINA-2_{args.year}_{args.month:02d}.parquet"
    )
    manifest = args.manifest or (
        ERA5Paths().root
        / "manifests"
        / "ons"
        / f"year={args.year}"
        / f"month={args.month:02d}"
        / "download.json"
    )
    result = download_ons_generation(output, year=args.year, month=args.month)
    atomic_write_json(manifest, result)
    print(json.dumps(result, ensure_ascii=False, indent=2))


def command_build_catalog(args: argparse.Namespace) -> None:
    ons = load_ons_catalog(args.ons, subsystem=args.subsystem)
    membership = load_ons_membership(args.ons_membership, subsystem=args.subsystem) if args.ons_membership else None
    ons = expand_ons_groups(ons, membership)
    siga = load_siga_catalog(args.siga)
    catalog, report = reconcile_catalog(
        ons,
        siga,
        overrides_path=args.overrides,
        location_source=args.location_source or str(args.siga),
    )
    matched = catalog[catalog["match_status"].eq("matched")]
    if not matched.empty:
        report["bounds"] = calculate_bounds(catalog).serializable()
    atomic_write_parquet(catalog, args.output)
    atomic_write_json(args.report, report)
    print(
        f"Catálogo: {args.output} ({report['plants']} usinas, {len(catalog)} localizações; "
        f"cobertura {report['plant_coverage']:.1%})"
    )
    print(f"Relatório: {args.report}")
    if report["plant_coverage"] < args.minimum_coverage:
        raise SystemExit(
            f"Cobertura {report['plant_coverage']:.1%} abaixo do mínimo {args.minimum_coverage:.1%}. "
            "Revise o relatório/overrides antes do backfill."
        )


def command_plan(args: argparse.Namespace) -> None:
    _, bounds, requests = _catalog_and_requests(args.catalog, args.start, args.end)
    result = {"bounds": bounds.serializable(), "requests": [_request_json(item) for item in requests]}
    if args.output:
        atomic_write_json(args.output, result)
        print(f"Plano salvo em {args.output}")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


def _run_requests(args: argparse.Namespace, start: date, end: date) -> None:
    catalog, bounds, requests = _catalog_and_requests(args.catalog, start, end)
    plant_located = catalog.groupby("usina_id")["match_status"].apply(lambda values: bool(values.eq("matched").all()))
    coverage = float(plant_located.mean()) if len(plant_located) else 0.0
    if coverage < args.minimum_location_coverage:
        raise ValueError(
            f"Cobertura de localização {coverage:.1%} abaixo do mínimo {args.minimum_location_coverage:.1%}."
        )
    catalog_identity_columns = [
        column for column in [
            "usina_id", "location_id", "latitude", "longitude", "capacidade_instalada_mw",
            "relationship_start", "relationship_end", "match_status",
        ] if column in catalog
    ]
    sort_columns = [column for column in ["usina_id", "location_id", "relationship_start"] if column in catalog_identity_columns]
    catalog_records = catalog[catalog_identity_columns].sort_values(sort_columns, na_position="first").fillna("").astype(str).to_dict("records")
    catalog_hash = stable_hash(catalog_records)
    paths = ERA5Paths(args.data_root)
    print(f"Área CDS: {bounds.as_cds_area()}; partições: {len(requests)}")
    for request in requests:
        raw = paths.raw_month(request.year, request.month)
        raw_manifest = paths.raw_manifest(request.year, request.month)
        processed = paths.weather_month(request.year, request.month)
        processed_manifest = paths.processed_manifest(request.year, request.month)
        if args.dry_run:
            print(f"[dry-run] {request.label}: {raw}")
            continue
        result = download_month(
            request,
            raw,
            raw_manifest,
            overwrite=args.overwrite,
            max_attempts=args.max_attempts,
        )
        print(f"{request.label}: download {result['status']}")
        processed_state = read_manifest(processed_manifest)
        should_process = (
            args.overwrite
            or not processed.exists()
            or not processed_state
            or processed_state.get("request_hash") != request.request_hash
            or processed_state.get("catalog_hash") != catalog_hash
        )
        if should_process:
            manifest = extract_file(
                raw,
                catalog,
                processed,
                processed_manifest,
                expected_hours=request.expected_hours,
                request_hash=request.request_hash,
                catalog_hash=catalog_hash,
            )
            print(f"{request.label}: {manifest['quality']['rows']} linhas processadas")
        else:
            print(f"{request.label}: processamento skipped")


def command_backfill(args: argparse.Namespace) -> None:
    _run_requests(args, args.start, args.end)


def command_update(args: argparse.Namespace) -> None:
    end = args.end or (datetime.now(timezone.utc).date() - timedelta(days=args.availability_lag_days))
    start = end - timedelta(days=args.rolling_days - 1)
    _run_requests(args, start, end)


def command_reconcile(args: argparse.Namespace) -> None:
    end = args.end or (datetime.now(timezone.utc).date() - timedelta(days=args.availability_lag_days))
    month_start = date(end.year, end.month, 1)
    for _ in range(args.months_back - 1):
        previous = month_start - timedelta(days=1)
        month_start = date(previous.year, previous.month, 1)
    args.overwrite = True
    _run_requests(args, month_start, end)


def command_extract(args: argparse.Namespace) -> None:
    catalog = read_tabular(args.catalog)
    manifest = extract_file(
        args.input,
        catalog,
        args.output,
        args.manifest,
        expected_hours=args.expected_hours,
        request_hash=args.request_hash,
        catalog_hash=None,
    )
    print(json.dumps(manifest["quality"], ensure_ascii=False, indent=2))


def command_validate(args: argparse.Namespace) -> None:
    weather = read_tabular(args.input)
    report = validate_weather(weather, expected_hours=args.expected_hours)
    if args.output:
        atomic_write_json(args.output, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not report.get("valid"):
        raise SystemExit(2)


def command_join_ons(args: argparse.Namespace) -> None:
    ons = _load_many(args.ons)
    catalog = read_tabular(args.catalog)
    weather = _load_many(args.weather)
    if args.ons_format == "generation":
        ons_hourly, ons_report = prepare_ons_generation_hourly(
            ons,
            catalog,
            subsystem=args.subsystem,
            source_timezone=args.ons_timezone,
        )
    else:
        ons_hourly, ons_report = prepare_ons_hourly(
            ons,
            catalog,
            source_timezone=args.ons_timezone,
            minimum_intervals=args.minimum_intervals,
        )
    joined, join_report = join_ons_era5(ons_hourly, weather)
    atomic_write_parquet(joined, args.output)
    report = {"ons": ons_report, "join": join_report}
    atomic_write_json(args.report, report)
    print(f"Snapshot unido: {args.output} ({len(joined)} linhas)")
    print(f"Cobertura da união: {join_report['ons_join_coverage']:.1%}")


def command_build_pwf_mapping(args: argparse.Namespace) -> None:
    catalog = read_tabular(args.catalog)
    mapping, report = build_pwf_bus_mapping(
        args.workbook,
        catalog,
        sheet_name=args.sheet,
    )
    atomic_write_parquet(mapping, args.output)
    atomic_write_json(args.report, report)
    print(
        f"Mapeamento PWF: {args.output} ({report['mapped_plants']} conjuntos, "
        f"{report['mapped_buses']} barras)"
    )
    print(f"Relatório: {args.report}")


def _add_run_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--catalog", required=True, type=Path)
    parser.add_argument("--data-root", type=Path, default=ERA5Paths().root)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--max-attempts", type=int, default=3)
    parser.add_argument("--minimum-location-coverage", type=float, default=0.95)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Coleta oficial ERA5 do ClimaGrid.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    siga = subparsers.add_parser("download-siga", help="Baixa o snapshot atual do SIGA/ANEEL.")
    siga.add_argument("--output", type=Path, default=ERA5Paths().root / "raw" / "siga" / "siga.csv")
    siga.add_argument("--manifest", type=Path, default=ERA5Paths().root / "manifests" / "siga.json")
    siga.add_argument("--source-url")
    siga.set_defaults(handler=command_download_siga)

    membership = subparsers.add_parser(
        "download-ons-membership",
        help="Baixa a composição oficial dos conjuntos de usinas do ONS.",
    )
    membership.add_argument(
        "--output",
        type=Path,
        default=ERA5Paths().root / "raw" / "ons" / "relacionamento_usina_conjunto.parquet",
    )
    membership.add_argument(
        "--manifest",
        type=Path,
        default=ERA5Paths().root / "manifests" / "ons_membership.json",
    )
    membership.add_argument("--source-url", default="https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/usina_conjunto/RELACIONAMENTO_USINA_CONJUNTO.parquet")
    membership.set_defaults(handler=command_download_ons_membership)

    generation = subparsers.add_parser(
        "download-ons-generation",
        help="Baixa os dados brutos de geração horária/semi-horária da ONS.",
    )
    generation.add_argument(
        "--year",
        type=int,
        required=True,
        help="Ano de referência para baixar (ex: 2024).",
    )
    generation.add_argument(
        "--month",
        type=int,
        required=True,
        choices=range(1, 13),
        metavar="1-12",
        help="Mês de referência do arquivo horário.",
    )
    generation.add_argument(
        "--output",
        type=Path,
        default=None,
    )
    generation.add_argument(
        "--manifest",
        type=Path,
        default=None,
    )
    generation.set_defaults(handler=command_download_ons_generation)

    catalog = subparsers.add_parser("build-catalog", help="Concilia usinas ONS e SIGA por CEG.")
    catalog.add_argument("--ons", required=True, nargs="+", type=Path)
    catalog.add_argument("--siga", required=True, type=Path)
    catalog.add_argument("--ons-membership", type=Path)
    catalog.add_argument("--subsystem", default="NE")
    catalog.add_argument("--overrides", type=Path)
    catalog.add_argument("--location-source")
    catalog.add_argument("--minimum-coverage", type=float, default=0.95)
    catalog.add_argument("--output", type=Path, default=ERA5Paths().root / "processed" / "reference" / "plant_locations.parquet")
    catalog.add_argument("--report", type=Path, default=ERA5Paths().root / "processed" / "reference" / "plant_locations_report.json")
    catalog.set_defaults(handler=command_build_catalog)

    plan = subparsers.add_parser("plan", help="Exibe os pedidos mensais sem acessar o CDS.")
    plan.add_argument("--catalog", required=True, type=Path)
    plan.add_argument("--start", required=True, type=_date)
    plan.add_argument("--end", required=True, type=_date)
    plan.add_argument("--output", type=Path)
    plan.set_defaults(handler=command_plan)

    backfill = subparsers.add_parser("backfill", help="Baixa e processa um período histórico.")
    _add_run_options(backfill)
    backfill.add_argument("--start", required=True, type=_date)
    backfill.add_argument("--end", required=True, type=_date)
    backfill.set_defaults(handler=command_backfill)

    update = subparsers.add_parser("update", help="Atualiza uma janela recente.")
    _add_run_options(update)
    update.add_argument("--end", type=_date)
    update.add_argument("--rolling-days", type=int, default=10)
    update.add_argument("--availability-lag-days", type=int, default=5)
    update.set_defaults(handler=command_update)

    reconcile = subparsers.add_parser("reconcile", help="Refaz meses recentes para substituir ERA5T.")
    _add_run_options(reconcile)
    reconcile.add_argument("--end", type=_date)
    reconcile.add_argument("--months-back", type=int, default=3)
    reconcile.add_argument("--availability-lag-days", type=int, default=5)
    reconcile.set_defaults(handler=command_reconcile)

    extract = subparsers.add_parser("extract", help="Extrai um NetCDF existente por usina.")
    extract.add_argument("--catalog", required=True, type=Path)
    extract.add_argument("--input", required=True, type=Path)
    extract.add_argument("--output", required=True, type=Path)
    extract.add_argument("--manifest", required=True, type=Path)
    extract.add_argument("--expected-hours", type=int)
    extract.add_argument("--request-hash")
    extract.set_defaults(handler=command_extract)

    validate = subparsers.add_parser("validate", help="Valida um Parquet climático processado.")
    validate.add_argument("--input", required=True, type=Path)
    validate.add_argument("--expected-hours", type=int)
    validate.add_argument("--output", type=Path)
    validate.set_defaults(handler=command_validate)

    join = subparsers.add_parser("join-ons", help="Normaliza a ONS horária e une ao ERA5.")
    join.add_argument("--ons", required=True, nargs="+", type=Path)
    join.add_argument("--weather", required=True, nargs="+", type=Path)
    join.add_argument("--catalog", required=True, type=Path)
    join.add_argument("--ons-format", choices=["generation", "restriction"], default="generation")
    join.add_argument("--subsystem", default="NE")
    join.add_argument("--ons-timezone", default="America/Sao_Paulo")
    join.add_argument("--minimum-intervals", type=int, default=2)
    join.add_argument("--output", required=True, type=Path)
    join.add_argument("--report", required=True, type=Path)
    join.set_defaults(handler=command_join_ons)

    pwf_mapping = subparsers.add_parser(
        "build-pwf-mapping",
        help="Concilia o catálogo ONS com as barras da planilha de referência PWF.",
    )
    pwf_mapping.add_argument("--workbook", required=True, type=Path)
    pwf_mapping.add_argument("--sheet", default="Usinas")
    pwf_mapping.add_argument("--catalog", required=True, type=Path)
    pwf_mapping.add_argument("--output", required=True, type=Path)
    pwf_mapping.add_argument("--report", required=True, type=Path)
    pwf_mapping.set_defaults(handler=command_build_pwf_mapping)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
