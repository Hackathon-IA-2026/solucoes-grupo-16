"""Candidate tuning restricted to development assignments."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from training.config import TrainingConfig
from training.estimators import create_estimator
from training.evaluate import metrics_by_wind_and_plant
from training.features import feature_matrix
from training.protocol import ProtocolManifest, ProtocolState, canonical_bytes, sha256_json
from training.physical_curve import apply_physical_bounds
from training.splits import assigned_rows, assignment_hash, assert_job_dataset_scope
from training.train import _prepared


def tune(dataset: pd.DataFrame, assignments: pd.DataFrame, protocol: ProtocolManifest,
         config: TrainingConfig) -> dict:
    if protocol.state not in {ProtocolState.INFRASTRUCTURE_TEST, ProtocolState.EXPLORATORY,
                              ProtocolState.PROTOCOL_FROZEN}:
        raise ValueError("Tuning não é permitido após congelar o modelo.")
    if not set(assignments.role) & {"train", "early_stopping", "evaluation"}:
        raise ValueError("Atribuições não contêm desenvolvimento.")
    assert_job_dataset_scope(dataset, assignments, {"train", "early_stopping", "evaluation"})
    prepared = _prepared(dataset, config.target_column(), config)
    results = []
    for candidate in protocol.candidates:
        fold_results = []
        for fold in protocol.folds:
            train = assigned_rows(prepared, assignments, fold_id=fold.fold_id, role="train")
            stopping = assigned_rows(prepared, assignments, fold_id=fold.fold_id, role="early_stopping")
            evaluation = assigned_rows(prepared, assignments, fold_id=fold.fold_id, role="evaluation")
            estimator = create_estimator(candidate, random_state=config.random_state, n_jobs=config.n_jobs)
            estimator.fit(feature_matrix(train), train.residual_cf,
                          feature_matrix(stopping), stopping.residual_cf)
            correction = estimator.predict(feature_matrix(evaluation)) * evaluation.capacidade_instalada_mw
            evaluation["hybrid_mw"] = apply_physical_bounds(
                evaluation.baseline_mw, correction, evaluation.wind_speed_100m,
                evaluation.capacidade_instalada_mw, evaluation.disponibilidade, config.physical_curve)
            fold_results.append({"fold_id": fold.fold_id, "best_iteration": estimator.best_iteration,
                                 "metrics": metrics_by_wind_and_plant(evaluation, "hybrid_mw")})
        primary = protocol.selection_rule.get("primary_metric", "mae_mw")
        score = sum(item["metrics"]["overall"][primary] for item in fold_results) / len(fold_results)
        results.append({"candidate_id": candidate["candidate_id"], "algorithm": candidate["algorithm"],
                        "folds": fold_results, "aggregate_score": score})
    results.sort(key=lambda value: (value["aggregate_score"], value["candidate_id"]))
    return {"protocol_version": protocol.protocol_version,
            "protocol_manifest_sha256": protocol.digest(),
            "assignments_sha256": assignment_hash(assignments),
            "selected_candidate_id": results[0]["candidate_id"], "candidates": results,
            "selection_sha256": sha256_json(results)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Executa tuning somente nos folds de desenvolvimento.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--assignments", required=True, type=Path)
    parser.add_argument("--protocol", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    from training.build_dataset import TabularDatasetAdapter, prepare_snapshot
    from training.config import load_config
    protocol, config = ProtocolManifest.load(args.protocol), load_config(args.config)
    dataset, _ = prepare_snapshot(TabularDatasetAdapter().load(args.input), config)
    assignments = pd.read_parquet(args.assignments) if args.assignments.suffix == ".parquet" else pd.read_csv(args.assignments)
    result = tune(dataset, assignments, protocol, config)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(canonical_bytes(result) + b"\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
