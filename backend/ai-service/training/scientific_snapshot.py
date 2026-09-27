"""Audit and freeze a reproducible scientific snapshot without choosing splits.

This job is deliberately upstream of the temporal protocol.  It inventories
the data that actually exist and records blockers; it never invents calendar
boundaries, approves a target contract, or opens reserved partitions.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

import pandas as pd

from training.build_dataset import (DatasetValidationError, TabularDatasetAdapter,
                                    _write_dataframe, prepare_snapshot)
from training.config import load_config
from training.protocol import (SCIENTIFIC_PREREQUISITES, canonical_bytes, file_sha256,
                               sha256_json, TimeBlock)
from training.splits import snapshot_logical_hash


SNAPSHOT_SCHEMA_VERSION = "scientific-snapshot-v1"
POLICY_SCHEMA_VERSION = "target-eligibility-v1"
EXPECTED_POLICY = {
    "schema_version": POLICY_SCHEMA_VERSION,
    "target_name": "geracao_referencia_mw",
    "missing_target": "exclude",
    "negative_target": "exclude",
    "above_installed_capacity": "exclude",
    "above_available_capacity": "retain_and_flag",
    "duplicate_logical_key": "exclude_all",
    "clipping": False,
    "imputation": False,
}


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Documento deve ser objeto JSON: {path}.")
    return value


def validate_eligibility_policy(policy: dict[str, Any]) -> None:
    actual = {name: policy.get(name) for name in EXPECTED_POLICY}
    if actual != EXPECTED_POLICY:
        differences = sorted(name for name, expected in EXPECTED_POLICY.items()
                             if actual.get(name) != expected)
        raise ValueError(
            "Política de elegibilidade não corresponde ao comportamento implementado "
            f"({differences}). Altere explicitamente código e testes antes de congelar outra política."
        )


def validate_decisions(decisions: dict[str, Any]) -> tuple[dict[str, bool], list[str]]:
    unknown = set(decisions) - SCIENTIFIC_PREREQUISITES
    if unknown:
        raise ValueError(f"Decisões científicas desconhecidas: {sorted(unknown)}.")
    normalized = {name: decisions.get(name) is True for name in sorted(SCIENTIFIC_PREREQUISITES)}
    blockers = [name for name, approved in normalized.items() if not approved]
    return normalized, blockers


def _validated_validity(validity: pd.DataFrame, plants: set[str]) -> pd.DataFrame:
    required = {"usina_id", "valid_from_utc", "valid_to_utc"}
    if not required <= set(validity):
        raise ValueError(f"Vigência sem colunas: {sorted(required - set(validity))}.")
    result = validity.loc[:, sorted(required)].copy()
    result["usina_id"] = result.usina_id.astype(str)
    result["valid_from_utc"] = pd.to_datetime(result.valid_from_utc, utc=True, errors="coerce")
    result["valid_to_utc"] = pd.to_datetime(result.valid_to_utc, utc=True, errors="coerce")
    if result.isna().any().any() or (result.valid_from_utc >= result.valid_to_utc).any():
        raise ValueError("Vigência contém limites ausentes, ingênuos ou invertidos.")
    for plant, group in result.sort_values(["usina_id", "valid_from_utc"]).groupby("usina_id"):
        if len(group) > 1 and (group.valid_from_utc.iloc[1:].reset_index(drop=True)
                               < group.valid_to_utc.iloc[:-1].reset_index(drop=True)).any():
            raise ValueError(f"Vigências sobrepostas para {plant}.")
    missing = plants - set(result.usina_id)
    if missing:
        raise ValueError(f"Conjuntos observados sem vigência: {sorted(missing)}.")
    return result


def _active_plant_hours(validity: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp) -> tuple[int, int]:
    expected = 0
    active = 0
    for row in validity.itertuples(index=False):
        overlap_start = max(start, row.valid_from_utc)
        overlap_end = min(end, row.valid_to_utc)
        hours = max(0, int((overlap_end - overlap_start).total_seconds() // 3600))
        expected += hours
        active += int(hours > 0)
    return expected, active


def inventory_snapshot(snapshot: pd.DataFrame, validity: pd.DataFrame | None) -> dict[str, Any]:
    timestamps = pd.to_datetime(snapshot.timestamp_utc, utc=True)
    first, last = timestamps.min(), timestamps.max()
    month_starts = pd.date_range(first.floor("D").replace(day=1),
                                 last.floor("D").replace(day=1), freq="MS", tz="UTC")
    rows = []
    for start in month_starts:
        end = start + pd.offsets.MonthBegin(1)
        selected = snapshot.loc[timestamps.ge(start) & timestamps.lt(end)]
        observed_hours = int(selected.timestamp_utc.nunique())
        expected_hours = int((end - start).total_seconds() // 3600)
        expected_plant_hours = None
        active_plants = int(selected.usina_id.nunique())
        coverage = None
        if validity is not None:
            expected_plant_hours, registered_active = _active_plant_hours(validity, start, end)
            active_plants = registered_active
            coverage = len(selected) / expected_plant_hours if expected_plant_hours else 0.0
        rows.append({
            "start_utc": start.isoformat(), "end_utc": end.isoformat(),
            "expected_hours": expected_hours, "observed_hours": observed_hours,
            "active_plants": active_plants, "rows": int(len(selected)),
            "expected_active_plant_hours": expected_plant_hours,
            "coverage_fraction": coverage,
        })
    gaps = []
    for plant, group in snapshot.groupby("usina_id"):
        ordered = pd.to_datetime(group.timestamp_utc, utc=True).sort_values()
        deltas = ordered.diff().dropna().dt.total_seconds().div(3600)
        missing = deltas.loc[deltas > 1]
        gaps.append({"usina_id": str(plant), "gap_count": int(len(missing)),
                     "missing_hours_between_observations": int((missing - 1).sum())})
    return {
        "period_utc": {"start": first.isoformat(), "end_inclusive": last.isoformat()},
        "distinct_hours": int(timestamps.nunique()),
        "distinct_plants": int(snapshot.usina_id.nunique()),
        "rows": int(len(snapshot)),
        "by_month": rows,
        "gaps_by_plant": gaps,
    }


def freeze_snapshot(raw: pd.DataFrame, *, config, input_path: Path,
                    output_snapshot: Path, output_manifest: Path,
                    target_contract_path: Path, eligibility_policy_path: Path,
                    catalog_path: Path, composition_path: Path,
                    source_paths: dict[str, Path], decisions: dict[str, Any],
                    validity: pd.DataFrame | None = None,
                    exposed_periods: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    if output_snapshot.exists() or output_manifest.exists():
        raise FileExistsError("Snapshot e manifesto são imutáveis; escolha novos caminhos.")
    if config.scientific_target_column() != "geracao_referencia_mw":
        raise ValueError("Snapshot científico exige geracao_referencia_mw.")
    policy = _read_json(eligibility_policy_path)
    validate_eligibility_policy(policy)
    target_contract = _read_json(target_contract_path)
    if target_contract.get("target_name") != "geracao_referencia_mw":
        raise ValueError("Contrato do target não identifica geracao_referencia_mw.")
    prerequisites, blockers = validate_decisions(decisions)
    if (prerequisites["target_contract_approved"]
            and target_contract.get("approval_status") != "approved"):
        raise ValueError("Decisão aprovada exige approval_status=approved no contrato do target.")
    if (prerequisites["eligibility_policy_approved"]
            and policy.get("approval_status") != "approved"):
        raise ValueError("Decisão aprovada exige approval_status=approved na política de elegibilidade.")
    exposed_periods = exposed_periods or []
    for item in exposed_periods:
        if not isinstance(item, dict) or not str(item.get("reason", "")).strip():
            raise ValueError("Período exposto exige start_utc, end_utc e motivo.")
        TimeBlock(item.get("start_utc", ""), item.get("end_utc", ""))
    if prerequisites["exposed_periods_inventory_complete"] and not exposed_periods:
        raise ValueError("Inventário declarado completo não pode omitir os períodos expostos conhecidos.")
    snapshot, quality = prepare_snapshot(raw, config)
    checked_validity = (_validated_validity(validity, set(snapshot.usina_id.astype(str)))
                        if validity is not None else None)
    inventory = inventory_snapshot(snapshot, checked_validity)
    dependency_hashes = {
        "input_sha256": file_sha256(input_path),
        "target_contract_sha256": file_sha256(target_contract_path),
        "eligibility_policy_sha256": file_sha256(eligibility_policy_path),
        "catalog_sha256": file_sha256(catalog_path),
        "composition_sha256": file_sha256(composition_path),
        "source_sha256": {name: file_sha256(path) for name, path in sorted(source_paths.items())},
    }
    _write_dataframe(snapshot, output_snapshot)
    validity_records = None
    if checked_validity is not None:
        validity_records = (checked_validity.sort_values(
            ["usina_id", "valid_from_utc", "valid_to_utc"]
        ).astype(str).to_dict("records"))
    manifest = {
        "artifact_schema_version": SNAPSHOT_SCHEMA_VERSION,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "scientific_status": "ready_for_calendar_design" if not blockers else "blocked",
        "scientific_prerequisites": prerequisites,
        "blocking_decisions": blockers,
        "target_name": "geracao_referencia_mw",
        "target_role": "experimental_proxy_not_observed_replay_generation",
        "observed_generation_role": "audit_only_not_feature_not_target",
        "timezone": "UTC",
        "logical_key": ["usina_id", "timestamp_utc"],
        "target_clipped": False,
        "target_imputed": False,
        "gaps_imputed": False,
        **dependency_hashes,
        "snapshot_file_sha256": file_sha256(output_snapshot),
        "snapshot_logical_sha256": snapshot_logical_hash(snapshot),
        "validity_logical_sha256": (sha256_json(validity_records)
                                     if validity_records is not None else None),
        "quality_report": quality,
        "inventory": inventory,
        "exposed_periods": exposed_periods,
        "eligibility_policy": policy,
        "target_contract_reference": target_contract,
    }
    output_manifest.parent.mkdir(parents=True, exist_ok=True)
    output_manifest.write_bytes(canonical_bytes(manifest) + b"\n")
    return manifest


def _source_arguments(values: list[str]) -> dict[str, Path]:
    result = {}
    for value in values:
        if "=" not in value:
            raise ValueError("--source exige NOME=CAMINHO.")
        name, raw_path = value.split("=", 1)
        if not name.strip() or name in result:
            raise ValueError("Fontes exigem nomes únicos e não vazios.")
        result[name] = Path(raw_path)
    if not result:
        raise ValueError("Informe ao menos uma fonte com --source NOME=CAMINHO.")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Audita e congela snapshot científico sem definir ou abrir reservas temporais.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--output-snapshot", required=True, type=Path)
    parser.add_argument("--output-manifest", required=True, type=Path)
    parser.add_argument("--target-contract", required=True, type=Path)
    parser.add_argument("--eligibility-policy", required=True, type=Path)
    parser.add_argument("--catalog", required=True, type=Path)
    parser.add_argument("--composition", required=True, type=Path)
    parser.add_argument("--validity", type=Path)
    parser.add_argument("--decisions", required=True, type=Path)
    parser.add_argument("--exposed-periods", type=Path)
    parser.add_argument("--source", action="append", default=[])
    args = parser.parse_args()
    adapter = TabularDatasetAdapter()
    try:
        manifest = freeze_snapshot(
            adapter.load(args.input), config=load_config(args.config), input_path=args.input,
            output_snapshot=args.output_snapshot, output_manifest=args.output_manifest,
            target_contract_path=args.target_contract,
            eligibility_policy_path=args.eligibility_policy, catalog_path=args.catalog,
            composition_path=args.composition, source_paths=_source_arguments(args.source),
            decisions=_read_json(args.decisions),
            validity=adapter.load(args.validity) if args.validity else None,
            exposed_periods=(json.loads(args.exposed_periods.read_text(encoding="utf-8"))
                             if args.exposed_periods else []),
        )
    except DatasetValidationError as exc:
        parser.exit(2, json.dumps(exc.report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
