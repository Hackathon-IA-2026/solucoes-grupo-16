"""Prepare canonical ONS–ERA5 data and audit frozen predictions against observed MW.

This entry point does not train, tune, promote or replace a Predictor artifact.
"""
from __future__ import annotations

import argparse
from datetime import date
import importlib.metadata
import json
from pathlib import Path

import numpy as np
import pandas as pd

from ingestion.common.io import (
    atomic_write_json, atomic_write_parquet, read_tabular, sha256_file, utc_now_iso,
)
from ingestion.ons.hourly import _numeric, _timestamps_utc
from ingestion.ons.observed import (
    KEYS, OBSERVED, SNAPSHOT_SCHEMA, build_observed_snapshot,
)
from training.observed_metrics import evaluate_observed, render_report


def identity(path: Path) -> dict:
    return {"path": str(path.resolve()), "sha256": sha256_file(path)}


def verify(path: Path, expected: str) -> None:
    if len(expected) != 64 or sha256_file(path).lower() != expected.lower():
        raise ValueError(f"SHA-256 divergente: {path}")


def read_many(paths: list[Path]) -> pd.DataFrame:
    return pd.concat([read_tabular(path) for path in paths], ignore_index=True)


def raw_sample(snapshot: pd.DataFrame, raw: pd.DataFrame) -> pd.DataFrame:
    """Deterministic month/plant stratified sample traced back to source values."""
    selected = snapshot[KEYS + [OBSERVED]].copy()
    selected["month"] = selected.timestamp_utc.dt.tz_convert("America/Sao_Paulo").dt.strftime("%Y-%m")
    selected["rank"] = selected.groupby(["month", "usina_id"]).cumcount()
    # First spread across months, then across plants; retain at least 30 if available.
    selected["month_rank"] = selected.sort_values(["rank", "usina_id", "timestamp_utc"]).groupby("month").cumcount()
    selected = selected.sort_values(["month_rank", "month"]).head(30)
    source = raw.copy()
    source = source.loc[source.id_subsistema.astype("string").str.strip().eq("NE")
                        & source.nom_tipousina.astype("string").str.upper().str.contains("EOL", na=False)].copy()
    source["usina_id"] = source.id_ons.astype("string").str.strip()
    source["timestamp_utc"] = _timestamps_utc(source.din_instante, "America/Sao_Paulo")
    source["raw_val_geracao_mw"] = _numeric(source.val_geracao)
    source = source[KEYS + ["din_instante", "raw_val_geracao_mw"]].drop_duplicates()
    sampled = selected[KEYS + [OBSERVED]].merge(source, on=KEYS, validate="one_to_one")
    sampled["matches_raw"] = np.isclose(sampled[OBSERVED], sampled.raw_val_geracao_mw, rtol=0, atol=1e-9)
    if len(sampled) != min(30, len(snapshot)) or not sampled.matches_raw.all():
        raise ValueError("Amostra não confere com a geração bruta ONS.")
    return sampled


def prepare_files(
    generation_paths: list[Path], restriction_paths: list[Path], weather_paths: list[Path],
    catalog_path: Path, output_dir: Path,
) -> dict:
    if output_dir.exists():
        raise FileExistsError(f"Saída já existe: {output_dir}; escolha uma nova execução.")
    generation = read_many(generation_paths)
    snapshot, report = build_observed_snapshot(
        generation, read_many(restriction_paths), read_many(weather_paths), read_tabular(catalog_path),
    )
    sample = raw_sample(snapshot, generation)
    inputs = {
        "generation": [identity(p) for p in generation_paths],
        "restriction": [identity(p) for p in restriction_paths],
        "weather": [identity(p) for p in weather_paths], "catalog": identity(catalog_path),
    }
    output_dir.mkdir(parents=True, exist_ok=False)
    snapshot_path = output_dir / "observed_generation_snapshot.parquet"
    sample_path = output_dir / "raw_ons_sample.parquet"
    atomic_write_parquet(snapshot, snapshot_path)
    atomic_write_parquet(sample, sample_path)
    report.update({"inputs": inputs, "snapshot": identity(snapshot_path),
                   "raw_sample": {**identity(sample_path), "rows": len(sample), "all_match": True}})
    report_path = output_dir / "snapshot_report.json"
    atomic_write_json(report_path, report)
    manifest = {
        "schema_version": SNAPSHOT_SCHEMA, "created_at_utc": utc_now_iso(),
        "inputs": inputs, "snapshot": identity(snapshot_path), "report": identity(report_path),
        "raw_sample": identity(sample_path), "cohort": report["cohort"],
    }
    atomic_write_json(output_dir / "snapshot_manifest.json", manifest)
    return report


def collect_months(start: str, end: str, data_root: Path, output_dir: Path) -> dict:
    """Collect sources, rebuild CEG catalog, enforce coverage, include UTC spillover."""
    from ingestion.era5.cds_client import download_month
    from ingestion.era5.config import ERA5Paths
    from ingestion.era5.extract_points import extract_file
    from ingestion.era5.request_planner import plan_requests
    from ingestion.ons.source_client import download_ons_generation, download_ons_restriction
    from ingestion.plants.catalog import (
        calculate_bounds, expand_ons_groups, load_ons_catalog, load_ons_membership,
        load_siga_catalog, reconcile_catalog,
    )

    first, last = pd.Period(start, freq="M"), pd.Period(end, freq="M")
    if first > last or first.year < 2022:
        raise ValueError("Janela mensal inválida; início >= 2022 e anterior ao fim.")
    if output_dir.exists():
        raise FileExistsError(f"Saída já existe: {output_dir}")
    # Supporting reference data must be provided; never synthesize CEG/co-ordinates.
    siga = data_root / "raw/siga/siga.csv"
    membership = data_root / "raw/ons/relacionamento_usina_conjunto.parquet"
    for path in (siga, membership):
        if not path.is_file():
            raise FileNotFoundError(f"Cadastro obrigatório ausente: {path}")
    output_dir.mkdir(parents=True, exist_ok=False)
    progress = {"status": "collecting", "start_month": start, "end_month": end,
                "minimum_location_coverage": .95, "downloads": []}
    state_path = output_dir / "collection_report.json"
    atomic_write_json(state_path, progress)
    try:
        generation_paths, restriction_paths = [], []
        for month in pd.period_range(first, last, freq="M"):
            base = data_root / "raw/ons" / f"year={month.year}" / f"month={month.month:02d}"
            for prefix, downloader, paths in (
                ("GERACAO_USINA-2", download_ons_generation, generation_paths),
                ("RESTRICAO_COFF_EOLICA", download_ons_restriction, restriction_paths),
            ):
                path = base / f"{prefix}_{month.year}_{month.month:02d}.parquet"
                if not path.exists():
                    download = downloader(path, month.year, month.month)
                    atomic_write_json(path.with_suffix(".download.json"), download)
                    progress["downloads"].append(download)
                    atomic_write_json(state_path, progress)
                paths.append(path)
        expanded = expand_ons_groups(
            load_ons_catalog(generation_paths, subsystem="NE", plant_type="EOL"),
            load_ons_membership(membership, subsystem="NE"),
        )
        catalog, catalog_report = reconcile_catalog(expanded, load_siga_catalog(siga), location_source=str(siga))
        catalog_path = output_dir / "catalog.parquet"
        atomic_write_parquet(catalog, catalog_path)
        atomic_write_json(output_dir / "catalog_report.json", catalog_report)
        located = catalog.assign(located=(catalog.match_status.eq("matched")
                                          & catalog.latitude.notna() & catalog.longitude.notna()))
        complete = located.groupby("usina_id").located.all()
        coverage = float(complete.mean()) if len(complete) else 0.0
        progress.update({"catalog_coverage": coverage,
                         "unlocated_or_partial_plants": complete.index[~complete].tolist(),
                         "reference_sources": {"siga": identity(siga), "membership": identity(membership)},
                         "generation_sources": [identity(p) for p in generation_paths],
                         "restriction_sources": [identity(p) for p in restriction_paths]})
        atomic_write_json(state_path, progress)
        if coverage < .95:
            raise ValueError(f"Cobertura de localização {coverage:.2%} abaixo de 95%; revise catalog_report.json.")
        # Last local day ends at 02:00 UTC of the next month: include that day.
        spillover = last + 1
        requests = plan_requests(date(first.year, first.month, 1),
                                 date(spillover.year, spillover.month, 1), calculate_bounds(catalog))
        weather_paths = []
        # The existing planner retrieves whole UTC months, including spillover.
        # Isolate extraction from the operational cache because catalogs can differ.
        paths = ERA5Paths(output_dir / "era5")
        for request in requests:
            raw, weather = paths.raw_month(request.year, request.month), paths.weather_month(request.year, request.month)
            download_month(request, raw, paths.raw_manifest(request.year, request.month))
            extract_file(raw, catalog, weather, paths.processed_manifest(request.year, request.month),
                         request_hash=request.request_hash, catalog_hash=sha256_file(catalog_path))
            weather_paths.append(weather)
        report = prepare_files(generation_paths, restriction_paths, weather_paths, catalog_path, output_dir / "snapshot")
        progress.update({"status": "completed", "cohort": report["cohort"], "join": report["join"]})
        atomic_write_json(state_path, progress)
        return progress
    except Exception as exc:
        progress.update({"status": "blocked", "error": f"{type(exc).__name__}: {exc}"})
        atomic_write_json(state_path, progress)
        raise


def evaluate_files(
    *, predictions_path: Path, snapshot_manifests: list[Path], model_path: Path,
    expected_predictions_sha256: str, expected_model_sha256: str,
    columns: list[str], output_dir: Path,
) -> dict:
    if output_dir.exists():
        raise FileExistsError(f"Saída já existe: {output_dir}; auditorias são imutáveis.")
    # Verify Gate A before reading prediction rows or emitting metrics.
    verify(predictions_path, expected_predictions_sha256)
    verify(model_path, expected_model_sha256)
    snapshot_paths = []
    for path in snapshot_manifests:
        manifest = json.loads(path.read_text(encoding="utf-8"))
        if manifest.get("schema_version") != SNAPSHOT_SCHEMA:
            raise ValueError(f"Manifesto não identifica snapshot de geração observada: {path}")
        for field in ("snapshot", "report", "raw_sample"):
            record = manifest[field]
            verify(Path(record["path"]), record["sha256"])
        for field, records in manifest["inputs"].items():
            for record in records if isinstance(records, list) else [records]:
                verify(Path(record["path"]), record["sha256"])
        snapshot_paths.append(Path(manifest["snapshot"]["path"]))
    paired, report = evaluate_observed(read_tabular(predictions_path), read_many(snapshot_paths), columns)
    report["inputs"] = {"predictions": identity(predictions_path), "model": identity(model_path),
                        "snapshot_manifests": [identity(p) for p in snapshot_manifests]}
    report["frozen_artifacts_verified"] = True
    output_dir.mkdir(parents=True, exist_ok=False)
    paired_path = output_dir / "observed_generation_predictions.parquet"
    report_path = output_dir / "observed_generation_report.json"
    markdown_path = output_dir / "COMPARATIVO_MODELO_VS_GERACAO_VERIFICADA_ONS.md"
    atomic_write_parquet(paired, paired_path)
    atomic_write_json(report_path, report)
    markdown_path.write_text(render_report(report), encoding="utf-8")
    atomic_write_json(output_dir / "observed_generation_manifest.json", {
        "schema_version": report["schema_version"], "created_at_utc": utc_now_iso(),
        "inputs": report["inputs"], "cohort": report["cohort"],
        "outputs": [identity(p) for p in (paired_path, report_path, markdown_path)],
        "libraries": {name: importlib.metadata.version(name) for name in ("pandas", "numpy", "pyarrow")},
    })
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare", help="Cruza arquivos existentes; preserva ambos os alvos.")
    for flag in ("ons", "restriction", "weather"):
        prepare.add_argument(f"--{flag}", nargs="+", required=True, type=Path)
    prepare.add_argument("--catalog", required=True, type=Path)
    prepare.add_argument("--output-dir", required=True, type=Path)
    collect = commands.add_parser("collect", help="Coleta intervalo mensal e materializa snapshot canônico.")
    collect.add_argument("--start-month", required=True)
    collect.add_argument("--end-month", required=True)
    collect.add_argument("--data-root", type=Path, default=Path("data"))
    collect.add_argument("--output-dir", required=True, type=Path)
    collect.add_argument("--env-file", type=Path)
    evaluate = commands.add_parser("evaluate", help="Avalia previsões congeladas nos dois alvos pareados.")
    evaluate.add_argument("--predictions", required=True, type=Path)
    evaluate.add_argument("--snapshot-manifests", nargs="+", required=True, type=Path)
    evaluate.add_argument("--prediction-columns", nargs="+", required=True)
    evaluate.add_argument("--model", required=True, type=Path)
    evaluate.add_argument("--frozen-report", type=Path, help="annual_report.json original com hashes do modelo/previsões")
    evaluate.add_argument("--expected-predictions-sha256")
    evaluate.add_argument("--expected-model-sha256")
    evaluate.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    if args.command == "prepare":
        report = prepare_files(args.ons, args.restriction, args.weather, args.catalog, args.output_dir)
    elif args.command == "collect":
        if args.env_file:
            from dotenv import load_dotenv
            load_dotenv(args.env_file, override=False)
        report = collect_months(args.start_month, args.end_month, args.data_root, args.output_dir)
    else:
        predictions_hash, model_hash = args.expected_predictions_sha256, args.expected_model_sha256
        if args.frozen_report:
            if predictions_hash or model_hash:
                parser.error("Use --frozen-report OU os dois hashes explícitos.")
            frozen = json.loads(args.frozen_report.read_text(encoding="utf-8"))
            predictions_hash = frozen["outputs"]["predictions_sha256"]
            model_hash = frozen["inputs"]["base_model"]["sha256"]
        if not predictions_hash or not model_hash:
            parser.error("Informe --frozen-report ou ambos os hashes congelados.")
        report = evaluate_files(
            predictions_path=args.predictions, snapshot_manifests=args.snapshot_manifests,
            model_path=args.model, expected_predictions_sha256=predictions_hash,
            expected_model_sha256=model_hash, columns=args.prediction_columns, output_dir=args.output_dir,
        )
    print(json.dumps({"output_dir": str(args.output_dir), "cohort": report.get("cohort"),
                      "status": report.get("status", "snapshot_prepared")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
