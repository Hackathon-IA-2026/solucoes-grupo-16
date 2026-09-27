"""Pure calendar-based row assignment for the temporal protocol."""
from __future__ import annotations

import hashlib
import json
import argparse
from pathlib import Path

import pandas as pd
import numpy as np

from training.protocol import (ProtocolManifest, ProtocolState, TimeBlock, canonical_bytes,
                               validate_expanding_folds)


ASSIGNMENT_COLUMNS = ["protocol_version", "fold_id", "usina_id", "timestamp_utc", "role", "row_fingerprint"]


def row_fingerprint(row: pd.Series) -> str:
    def scalar(value):
        if isinstance(value, pd.Timestamp):
            return value.isoformat()
        if isinstance(value, np.generic):
            return value.item()
        if pd.isna(value):
            return None
        return value
    values = {str(key): scalar(value) for key, value in sorted(row.items())}
    return hashlib.sha256(canonical_bytes(values)).hexdigest()


def _assign(frame: pd.DataFrame, protocol: ProtocolManifest, fold_id: str, role: str,
            block: TimeBlock) -> list[dict]:
    selected = frame.loc[block.contains(frame["timestamp_utc"])]
    return [{"protocol_version": protocol.protocol_version, "fold_id": fold_id,
             "usina_id": str(row.usina_id), "timestamp_utc": row.timestamp_utc.isoformat(),
             "role": role, "row_fingerprint": row.row_fingerprint}
            for row in selected.itertuples(index=False)]


def assignment_hash(assignments: pd.DataFrame) -> str:
    stable = assignments.sort_values(ASSIGNMENT_COLUMNS).reset_index(drop=True)
    return hashlib.sha256(stable.to_csv(index=False, lineterminator="\n").encode("utf-8")).hexdigest()


def snapshot_logical_hash(frame: pd.DataFrame) -> str:
    work = frame.copy()
    work["timestamp_utc"] = pd.to_datetime(work["timestamp_utc"], utc=True, errors="coerce")
    fingerprints = sorted(work.apply(row_fingerprint, axis=1).tolist())
    return hashlib.sha256(canonical_bytes(fingerprints)).hexdigest()


def materialize_assignments(frame: pd.DataFrame, protocol: ProtocolManifest,
                            validity: pd.DataFrame | None = None) -> tuple[pd.DataFrame, dict]:
    required = {"usina_id", "timestamp_utc"}
    if not required <= set(frame):
        raise ValueError(f"Snapshot sem colunas obrigatórias: {sorted(required - set(frame))}.")
    work = frame.copy()
    work["timestamp_utc"] = pd.to_datetime(work["timestamp_utc"], utc=True, errors="coerce")
    if work.timestamp_utc.isna().any() or work.usina_id.isna().any():
        raise ValueError("Atribuição exige usina e timestamp timezone-aware válidos.")
    if work.duplicated(["usina_id", "timestamp_utc"]).any():
        raise ValueError("Snapshot deve possuir uma linha por usina e hora.")
    snapshot_digest = snapshot_logical_hash(work)
    if (protocol.state not in {ProtocolState.INFRASTRUCTURE_TEST, ProtocolState.EXPLORATORY}
            and snapshot_digest != protocol.snapshot_sha256):
        raise ValueError("Snapshot não corresponde ao hash congelado no protocolo.")
    work["row_fingerprint"] = work.apply(row_fingerprint, axis=1)
    validate_expanding_folds(protocol.folds)
    records: list[dict] = []
    blocks: list[tuple[str, str, TimeBlock]] = []
    for fold in protocol.folds:
        blocks.extend((fold.fold_id, role, block) for role, block in (
            ("train", fold.train), ("early_stopping", fold.early_stopping), ("evaluation", fold.evaluation)))
    blocks.extend((("reserved", "calibration", protocol.calibration),
                   ("reserved", "final_test", protocol.final_test)))
    for fold_id, role, block in blocks:
        records.extend(_assign(work, protocol, fold_id, role, block))
    assignments = pd.DataFrame.from_records(records, columns=ASSIGNMENT_COLUMNS)
    if assignments.empty:
        raise ValueError("Nenhuma linha foi atribuída pelo protocolo.")
    summary = _validate_minimums(assignments, protocol)
    summary["coverage"] = coverage_by_validity(assignments, protocol, validity)
    if summary["coverage"]["minimum_fraction"] < protocol.minimums["coverage_fraction"]:
        raise ValueError("Cobertura abaixo do mínimo versionado.")
    summary["assignments_sha256"] = assignment_hash(assignments)
    summary["snapshot_logical_sha256"] = snapshot_digest
    summary["unassigned_rows"] = int((~work.row_fingerprint.isin(assignments.row_fingerprint)).sum())
    coverage = {(item["fold_id"], item["role"]): item
                for item in summary["coverage"]["by_block"]}
    for block in summary["blocks"]:
        block.update(coverage[(block["fold_id"], block["role"])])
    return assignments.sort_values(["fold_id", "role", "timestamp_utc", "usina_id"]).reset_index(drop=True), summary


def coverage_by_validity(assignments: pd.DataFrame, protocol: ProtocolManifest,
                         validity: pd.DataFrame | None) -> dict:
    """Coverage denominator is active registered hours, never all plants × period."""
    blocks = {(fold.fold_id, "train"): fold.train for fold in protocol.folds}
    blocks.update({(fold.fold_id, "early_stopping"): fold.early_stopping for fold in protocol.folds})
    blocks.update({(fold.fold_id, "evaluation"): fold.evaluation for fold in protocol.folds})
    blocks[("reserved", "calibration")] = protocol.calibration
    blocks[("reserved", "final_test")] = protocol.final_test
    if validity is None:
        validity = pd.DataFrame({"usina_id": assignments.usina_id.unique(),
                                 "valid_from_utc": min(pd.Timestamp(block.start_utc) for block in blocks.values()),
                                 "valid_to_utc": max(pd.Timestamp(block.end_utc) for block in blocks.values())})
    required = {"usina_id", "valid_from_utc", "valid_to_utc"}
    if not required <= set(validity):
        raise ValueError("Vigência exige usina_id, valid_from_utc e valid_to_utc.")
    active = validity.copy()
    active["valid_from_utc"] = pd.to_datetime(active.valid_from_utc, utc=True, errors="coerce")
    active["valid_to_utc"] = pd.to_datetime(active.valid_to_utc, utc=True, errors="coerce")
    if active[list(required)].isna().any().any() or (active.valid_from_utc >= active.valid_to_utc).any():
        raise ValueError("Vigência cadastral inválida.")
    active = active.sort_values(["usina_id", "valid_from_utc", "valid_to_utc"])
    for _, group in active.groupby("usina_id"):
        if len(group) > 1 and (group.valid_from_utc.iloc[1:].reset_index(drop=True)
                               < group.valid_to_utc.iloc[:-1].reset_index(drop=True)).any():
            raise ValueError("Segmentos de vigência da mesma usina não podem se sobrepor.")
    observed_plants = set(assignments.usina_id.astype(str))
    validity_plants = set(active.usina_id.astype(str))
    if not observed_plants <= validity_plants:
        raise ValueError("Há usina observada sem vigência cadastrada.")
    rows = []
    for key, block in blocks.items():
        expected = 0
        for item in active.itertuples(index=False):
            start = max(pd.Timestamp(block.start_utc), item.valid_from_utc)
            end = min(pd.Timestamp(block.end_utc), item.valid_to_utc)
            expected += max(0, int((end - start).total_seconds() // 3600))
        observed = len(assignments.loc[(assignments.fold_id == key[0]) & (assignments.role == key[1])])
        fraction = observed / expected if expected else 0.0
        rows.append({"fold_id": key[0], "role": key[1], "observed_plant_hours": observed,
                     "expected_active_plant_hours": expected, "fraction": fraction})
    return {"by_block": rows, "minimum_fraction": min(item["fraction"] for item in rows),
            "denominator": "registered active plant-hours intersected with [start,end)"}


def _validate_minimums(assignments: pd.DataFrame, protocol: ProtocolManifest) -> dict:
    blocks = {(fold.fold_id, "train"): fold.train for fold in protocol.folds}
    blocks.update({(fold.fold_id, "early_stopping"): fold.early_stopping for fold in protocol.folds})
    blocks.update({(fold.fold_id, "evaluation"): fold.evaluation for fold in protocol.folds})
    blocks.update({("reserved", "calibration"): protocol.calibration,
                   ("reserved", "final_test"): protocol.final_test})
    rows = []
    for (fold_id, role), group in assignments.groupby(["fold_id", "role"]):
        hours = group.timestamp_utc.nunique()
        plants = group.usina_id.nunique()
        if hours < protocol.minimums["hours_per_role"] or plants < protocol.minimums["plants_per_role"]:
            raise ValueError(f"Bloco insuficiente: {fold_id}/{role}.")
        block = blocks[(fold_id, role)]
        expected_hours = int((pd.Timestamp(block.end_utc) - pd.Timestamp(block.start_utc))
                             .total_seconds() // 3600)
        rows.append({"fold_id": fold_id, "role": role,
                     "start_utc": block.start_utc, "end_utc": block.end_utc,
                     "expected_hours": expected_hours, "observed_hours": hours,
                     "active_plants_observed": plants, "rows": len(group)})
    expected = {(fold.fold_id, role) for fold in protocol.folds
                for role in ("train", "early_stopping", "evaluation")}
    expected |= {("reserved", "calibration"), ("reserved", "final_test")}
    found = set(assignments.groupby(["fold_id", "role"]).groups)
    if missing := expected - found:
        raise ValueError(f"Blocos vazios: {sorted(missing)}.")
    return {"blocks": rows}


def assigned_rows(frame: pd.DataFrame, assignments: pd.DataFrame, *, fold_id: str, role: str) -> pd.DataFrame:
    selected = assignments.loc[(assignments.fold_id == fold_id) & (assignments.role == role)]
    keys = pd.MultiIndex.from_frame(selected[["usina_id", "timestamp_utc"]].assign(
        timestamp_utc=lambda value: pd.to_datetime(value.timestamp_utc, utc=True)))
    work = frame.copy()
    work["usina_id"] = work.usina_id.astype(str)
    work["timestamp_utc"] = pd.to_datetime(work.timestamp_utc, utc=True)
    return work.loc[pd.MultiIndex.from_frame(work[["usina_id", "timestamp_utc"]]).isin(keys)].copy()


def partition_rows(frame: pd.DataFrame, assignments: pd.DataFrame, roles: set[str]) -> pd.DataFrame:
    selected = assignments.loc[assignments.role.isin(roles), ["usina_id", "timestamp_utc"]].drop_duplicates()
    keys = pd.MultiIndex.from_frame(selected.assign(
        usina_id=lambda value: value.usina_id.astype(str),
        timestamp_utc=lambda value: pd.to_datetime(value.timestamp_utc, utc=True)))
    work = frame.copy()
    work["usina_id"] = work.usina_id.astype(str)
    work["timestamp_utc"] = pd.to_datetime(work.timestamp_utc, utc=True)
    return work.loc[pd.MultiIndex.from_frame(work[["usina_id", "timestamp_utc"]]).isin(keys)].copy()


def assert_job_dataset_scope(frame: pd.DataFrame, assignments: pd.DataFrame, roles: set[str]) -> None:
    authorized = partition_rows(frame, assignments, roles)
    if len(authorized) != len(frame):
        raise PermissionError(f"Dataset do job contém linhas fora dos papéis autorizados: {sorted(roles)}.")
    expected = assignments.loc[assignments.role.isin(roles), ["usina_id", "timestamp_utc"]].drop_duplicates()
    if len(authorized) != len(expected):
        raise ValueError("Partição autorizada incompleta ou com linhas inesperadas.")
    current = frame.copy()
    current["usina_id"] = current.usina_id.astype(str)
    current["timestamp_utc"] = pd.to_datetime(current.timestamp_utc, utc=True)
    current["row_fingerprint"] = current.apply(row_fingerprint, axis=1)
    expected_fingerprints = assignments.loc[assignments.role.isin(roles), [
        "usina_id", "timestamp_utc", "row_fingerprint"]].drop_duplicates()
    if expected_fingerprints.duplicated(["usina_id", "timestamp_utc"]).any():
        raise ValueError("Atribuições possuem fingerprints divergentes para a mesma linha.")
    expected_map = {(str(row.usina_id), pd.Timestamp(row.timestamp_utc)): row.row_fingerprint
                    for row in expected_fingerprints.itertuples(index=False)}
    if any(expected_map.get((row.usina_id, row.timestamp_utc)) != row.row_fingerprint
           for row in current.itertuples(index=False)):
        raise ValueError("Conteúdo da partição diverge dos fingerprints congelados.")


def write_assignments(assignments: pd.DataFrame, path: Path, summary: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() == ".parquet":
        assignments.to_parquet(path, index=False)
    else:
        assignments.to_csv(path, index=False)
    path.with_suffix(path.suffix + ".manifest.json").write_bytes(canonical_bytes(summary) + b"\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Materializa atribuições calendáricas do protocolo.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--protocol", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--validity", type=Path)
    parser.add_argument("--development-output", type=Path)
    parser.add_argument("--calibration-output", type=Path)
    parser.add_argument("--final-test-output", type=Path)
    args = parser.parse_args()
    from training.build_dataset import TabularDatasetAdapter, prepare_snapshot
    from training.config import load_config
    frame, _ = prepare_snapshot(TabularDatasetAdapter().load(args.input), load_config(args.config))
    validity = TabularDatasetAdapter().load(args.validity) if args.validity else None
    assignments, summary = materialize_assignments(frame, ProtocolManifest.load(args.protocol), validity)
    write_assignments(assignments, args.output, summary)
    for destination, roles in ((args.development_output, {"train", "early_stopping", "evaluation"}),
                               (args.calibration_output, {"calibration"}),
                               (args.final_test_output, {"final_test"})):
        if destination:
            destination.parent.mkdir(parents=True, exist_ok=True)
            partition = partition_rows(frame, assignments, roles)
            partition.to_parquet(destination, index=False) if destination.suffix == ".parquet" else partition.to_csv(destination, index=False)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
