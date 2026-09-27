"""Evaluate the DML challenger only on temporal-development folds."""
from __future__ import annotations

import argparse
from dataclasses import asdict
import json
from pathlib import Path

import pandas as pd

from training.build_dataset import TabularDatasetAdapter, prepare_snapshot
from training.causal.dml_plr import NuisanceConfig, fit_dml_plr
from training.causal.spec import CausalEstimandSpec
from training.config import TrainingConfig, load_config
from training.evaluate import metrics_by_wind_and_plant
from training.physical_curve import apply_physical_bounds
from training.protocol import ProtocolManifest, ProtocolState, canonical_bytes
from training.splits import assigned_rows, assignment_hash, assert_job_dataset_scope
from training.train import _prepared


DEVELOPMENT_ROLES = {"train", "early_stopping", "evaluation"}


def evaluate_dml_folds(
    dataset: pd.DataFrame,
    assignments: pd.DataFrame,
    protocol: ProtocolManifest,
    config: TrainingConfig,
    spec: CausalEstimandSpec,
    nuisance_config: NuisanceConfig = NuisanceConfig(),
) -> dict:
    """Compare DML with the physical baseline without opening reservations."""
    if protocol.state not in {
        ProtocolState.INFRASTRUCTURE_TEST,
        ProtocolState.EXPLORATORY,
        ProtocolState.PROTOCOL_FROZEN,
    }:
        raise ValueError("Experimento DML não é permitido após congelar o modelo.")
    assert_job_dataset_scope(dataset, assignments, DEVELOPMENT_ROLES)
    prepared = _prepared(dataset, config.target_column(), config)
    fold_results = []
    for fold in protocol.folds:
        train = assigned_rows(prepared, assignments, fold_id=fold.fold_id, role="train")
        evaluation = assigned_rows(prepared, assignments, fold_id=fold.fold_id, role="evaluation")
        model = fit_dml_plr(train, spec, nuisance_config)
        correction = model.predict_residual_cf(evaluation) * evaluation.capacidade_instalada_mw
        evaluation["dml_hybrid_mw"] = apply_physical_bounds(
            evaluation.baseline_mw,
            correction,
            evaluation.wind_speed_100m,
            evaluation.capacidade_instalada_mw,
            evaluation.disponibilidade,
            config.physical_curve,
        )
        fold_results.append({
            "fold_id": fold.fold_id,
            "baseline": metrics_by_wind_and_plant(evaluation, "baseline_mw"),
            "dml_hybrid": metrics_by_wind_and_plant(evaluation, "dml_hybrid_mw"),
            "causal_diagnostics": model.diagnostics,
        })
    primary = protocol.selection_rule.get("primary_metric", "mae_mw")
    baseline_score = sum(item["baseline"]["overall"][primary] for item in fold_results) / len(fold_results)
    dml_score = sum(item["dml_hybrid"]["overall"][primary] for item in fold_results) / len(fold_results)
    return {
        "artifact_schema_version": "causal-experiment-report-v1",
        "status": spec.status,
        "protocol_version": protocol.protocol_version,
        "protocol_manifest_sha256": protocol.digest(),
        "assignments_sha256": assignment_hash(assignments),
        "estimand_sha256": spec.digest(),
        "nuisance_config": asdict(nuisance_config),
        "primary_metric": primary,
        "baseline_aggregate_score": baseline_score,
        "dml_aggregate_score": dml_score,
        "dml_improves_baseline": dml_score < baseline_score,
        "folds": fold_results,
        "scientifically_approved": False,
    }


def _read_assignments(path: Path) -> pd.DataFrame:
    return pd.read_parquet(path) if path.suffix.lower() == ".parquet" else pd.read_csv(path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Avalia o challenger DML somente em folds de desenvolvimento.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--assignments", required=True, type=Path)
    parser.add_argument("--protocol", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--estimand", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    config = load_config(args.config)
    dataset, _ = prepare_snapshot(TabularDatasetAdapter().load(args.input), config)
    report = evaluate_dml_folds(
        dataset,
        _read_assignments(args.assignments),
        ProtocolManifest.load(args.protocol),
        config,
        CausalEstimandSpec.load(args.estimand),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(canonical_bytes(report) + b"\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
