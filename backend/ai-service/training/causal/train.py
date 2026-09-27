"""Fit and persist an exploratory DML bundle on development-only rows."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from training.build_dataset import TabularDatasetAdapter, prepare_snapshot
from training.causal.dml_plr import NuisanceConfig, fit_dml_plr
from training.causal.experiment import DEVELOPMENT_ROLES
from training.causal.spec import CausalEstimandSpec
from training.config import load_config
from training.protocol import ProtocolManifest, ProtocolState
from training.splits import assignment_hash, assert_job_dataset_scope
from training.train import _prepared


def main() -> None:
    parser = argparse.ArgumentParser(description="Treina bundle DML exploratório sem abrir reservas.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--assignments", required=True, type=Path)
    parser.add_argument("--protocol", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--estimand", required=True, type=Path)
    parser.add_argument("--artifacts", required=True, type=Path)
    args = parser.parse_args()
    protocol = ProtocolManifest.load(args.protocol)
    if protocol.state not in {ProtocolState.INFRASTRUCTURE_TEST, ProtocolState.EXPLORATORY}:
        parser.error("Este comando produz somente bundles experimentais; use protocolo não congelado.")
    spec = CausalEstimandSpec.load(args.estimand)
    if spec.status not in {"infrastructure_test", "exploratory"}:
        parser.error("Contrato causal congelado exige o futuro job de treino final controlado.")
    config = load_config(args.config)
    dataset, _ = prepare_snapshot(TabularDatasetAdapter().load(args.input), config)
    assignments = (pd.read_parquet(args.assignments) if args.assignments.suffix.lower() == ".parquet"
                   else pd.read_csv(args.assignments))
    assert_job_dataset_scope(dataset, assignments, DEVELOPMENT_ROLES)
    prepared = _prepared(dataset, config.target_column(), config)
    model = fit_dml_plr(prepared, spec, NuisanceConfig(
        random_state=config.random_state,
        n_jobs=config.n_jobs,
    ))
    metadata = model.save(args.artifacts, provenance={
        "protocol_version": protocol.protocol_version,
        "protocol_manifest_sha256": protocol.digest(),
        "assignments_sha256": assignment_hash(assignments),
        "target_contract_sha256": protocol.target_contract_sha256,
        "eligibility_policy_sha256": protocol.eligibility_policy_sha256,
        "snapshot_sha256": protocol.snapshot_sha256,
        "target": config.target,
    })
    print(json.dumps({
        "artifact_dir": str(args.artifacts),
        "model_version": metadata["model_version"],
        "status": metadata["status"],
        "theta": metadata["theta"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
