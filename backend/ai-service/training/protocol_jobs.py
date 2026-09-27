"""Frozen-model, exclusive-calibration and one-way final-test jobs."""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform

import lightgbm as lgb
import numpy as np
import pandas as pd

from training.config import TrainingConfig
from training.estimators import create_estimator
from training.evaluate import empirical_interval_table, interval_coverage, metrics_by_wind_and_plant
from training.features import FEATURE_COLUMNS, feature_matrix
from training.physical_curve import apply_physical_bounds
from training.protocol import ProtocolManifest, ProtocolState, canonical_bytes, file_sha256, sha256_json
from training.splits import assigned_rows, assignment_hash, assert_job_dataset_scope
from training.train import _prepared
from training.tune import validate_tuning_result


ACCESS_LOG_NAME = "reserved_access_log.json"


def _record_reserved_access(artifact_dir: Path, entry: dict) -> None:
    """Durably consume access before any reserved rows are selected/read."""
    path = artifact_dir / ACCESS_LOG_NAME
    entries = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    if entry["role"] == "final_test" and any(item["role"] == "final_test" for item in entries):
        raise PermissionError("Teste final já foi aberto e não pode ser consumido novamente.")
    entries.append(entry)
    temporary = path.with_suffix(".tmp")
    temporary.write_bytes(canonical_bytes(entries) + b"\n")
    temporary.replace(path)


def _candidate(protocol: ProtocolManifest, candidate_id: str) -> dict:
    matches = [item for item in protocol.candidates if item["candidate_id"] == candidate_id]
    if len(matches) != 1:
        raise ValueError("Candidato selecionado não pertence ao manifesto.")
    return matches[0]


def _development_rows(dataset: pd.DataFrame, assignments: pd.DataFrame) -> pd.DataFrame:
    fingerprints = assignments.loc[assignments.role.isin(["train", "early_stopping", "evaluation"]),
                                   ["usina_id", "timestamp_utc"]].drop_duplicates()
    keys = pd.MultiIndex.from_frame(fingerprints.assign(
        usina_id=lambda value: value.usina_id.astype(str),
        timestamp_utc=lambda value: pd.to_datetime(value.timestamp_utc, utc=True)))
    work = dataset.assign(usina_id=lambda value: value.usina_id.astype(str),
                          timestamp_utc=lambda value: pd.to_datetime(value.timestamp_utc, utc=True))
    return work.loc[pd.MultiIndex.from_frame(work[["usina_id", "timestamp_utc"]]).isin(keys)].copy()


def train_frozen_model(dataset: pd.DataFrame, assignments: pd.DataFrame,
                       protocol: ProtocolManifest, config: TrainingConfig,
                       tuning_result: dict, artifact_dir: Path) -> ProtocolManifest:
    if protocol.state != ProtocolState.PROTOCOL_FROZEN:
        raise ValueError("Treino final exige protocol_frozen.")
    assignments_digest = assignment_hash(assignments)
    validate_tuning_result(tuning_result, assignments, protocol)
    assert_job_dataset_scope(dataset, assignments, {"train", "early_stopping", "evaluation"})
    selected_id = tuning_result["selected_candidate_id"]
    selected = next(item for item in tuning_result["candidates"] if item["candidate_id"] == selected_id)
    candidate = _candidate(protocol, selected_id)
    iterations = sorted(item["best_iteration"] for item in selected["folds"])
    fixed_iterations = int(np.median(iterations))
    rule = protocol.final_training_rule
    fixed_iterations = max(int(rule.get("min_iterations", 1)),
                           min(fixed_iterations, int(rule.get("max_iterations", fixed_iterations))))
    candidate = {**candidate, "parameters": {**candidate.get("parameters", {}), "n_estimators": fixed_iterations}}
    candidate["parameters"].pop("early_stopping_rounds", None)
    development = _prepared(_development_rows(dataset, assignments), config.target_column(), config)
    # The common interface requires an eval set.  For fixed-iteration training it
    # is passed only to adapters with early stopping disabled by construction.
    estimator = create_estimator(candidate, random_state=config.random_state, n_jobs=config.n_jobs)
    if candidate["algorithm"] == "lightgbm":
        estimator.model.fit(feature_matrix(development), development.residual_cf)
        estimator.best_iteration = fixed_iterations
    else:
        estimator.model.fit(feature_matrix(development), development.residual_cf, verbose=False)
        estimator.best_iteration = fixed_iterations
    artifact_dir.mkdir(parents=True, exist_ok=False)
    model_name = "model.txt" if candidate["algorithm"] == "lightgbm" else "model.ubj"
    model_path = artifact_dir / model_name
    estimator.save(model_path)
    domain_columns = ["wind_speed_100m", "temperature_2m", "surface_pressure",
                      "capacidade_instalada_mw", "disponibilidade"]
    metadata = {
        "artifact_schema_version": "temporal-protocol-v1",
        "protocol_version": protocol.protocol_version,
        "frozen_protocol_manifest_sha256": protocol.digest(),
        "assignments_sha256": assignments_digest,
        "state": "model_frozen", "model_version": config.model_version,
        "model_scope": config.scope, "algorithm": candidate["algorithm"],
        "model_file": model_name, "model_sha256": file_sha256(model_path),
        "selected_candidate_id": selected_id, "fixed_iterations": fixed_iterations,
        "target": config.target, "training_config": config.serializable(),
        "physical_curve": config.serializable()["physical_curve"],
        "feature_order": FEATURE_COLUMNS,
        "training_usina_ids": sorted(development.usina_id.unique().tolist()),
        "input_domain": {name: {"min": float(development[name].min()), "max": float(development[name].max())}
                         for name in domain_columns},
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "runtime_versions": {"python": platform.python_version(), "lightgbm": lgb.__version__,
                             "numpy": np.__version__, "pandas": pd.__version__},
        "operational_homologation": {"status": False},
    }
    if candidate["algorithm"] == "xgboost":
        import xgboost
        metadata["runtime_versions"]["xgboost"] = xgboost.__version__
    (artifact_dir / "metadata.json").write_bytes(canonical_bytes(metadata) + b"\n")
    return protocol.transition(ProtocolState.MODEL_FROZEN, assignments_sha256=assignments_digest,
                               selected_candidate_id=selected_id, model_sha256=metadata["model_sha256"])


def _load_model(metadata: dict, artifact_dir: Path):
    model_path = artifact_dir / metadata["model_file"]
    if file_sha256(model_path) != metadata["model_sha256"]:
        raise ValueError("Hash do modelo divergente.")
    if metadata["algorithm"] == "lightgbm":
        return lgb.Booster(model_file=str(model_path))
    if metadata["algorithm"] == "xgboost":
        try:
            import xgboost as xgb
        except ImportError as exc:
            raise RuntimeError("xgboost não instalado.") from exc
        model = xgb.XGBRegressor()
        model.load_model(str(model_path))
        return model
    raise ValueError("Algoritmo incompatível.")


def _predict(frame: pd.DataFrame, model, config: TrainingConfig) -> pd.DataFrame:
    result = _prepared(frame, config.target_column(), config)
    correction = np.asarray(model.predict(feature_matrix(result))) * result.capacidade_instalada_mw
    result["hybrid_mw"] = apply_physical_bounds(
        result.baseline_mw, correction, result.wind_speed_100m,
        result.capacidade_instalada_mw, result.disponibilidade, config.physical_curve)
    return result


def calibrate_frozen_model(dataset: pd.DataFrame, assignments: pd.DataFrame,
                           protocol: ProtocolManifest, config: TrainingConfig,
                           artifact_dir: Path, *, actor: str) -> ProtocolManifest:
    accessed = protocol.with_access("calibration", actor=actor, purpose="calibrate_uncertainty")
    metadata_path = artifact_dir / "metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if metadata["model_sha256"] != protocol.model_sha256:
        raise ValueError("Modelo não corresponde ao protocolo.")
    if (artifact_dir / "residual_quantiles.json").exists():
        raise FileExistsError("Calibração já existe; artefatos são imutáveis.")
    assert_job_dataset_scope(dataset, assignments, {"calibration"})
    _record_reserved_access(artifact_dir, accessed.access_log[-1])
    calibration = assigned_rows(dataset, assignments, fold_id="reserved", role="calibration")
    predicted = _predict(calibration, _load_model(metadata, artifact_dir), config)
    allowed = set(protocol.calibration_rule.get("allowed_parameters", ["lower_quantile", "upper_quantile", "minimum_samples"]))
    supplied = set(protocol.calibration_rule.get("parameters", {}))
    if not supplied <= allowed:
        raise ValueError("Calibração tentou ajustar parâmetro não autorizado.")
    parameters = protocol.calibration_rule.get("parameters", {})
    if parameters.get("lower_quantile", .05) != .05 or parameters.get("upper_quantile", .95) != .95:
        raise ValueError("Implementação v1 aceita quantis 0.05/0.95.")
    table = empirical_interval_table(predicted, int(parameters.get("minimum_samples", config.min_interval_samples)))
    table.update({"artifact_schema_version": "temporal-calibration-v1",
                  "model_sha256": metadata["model_sha256"],
                  "assignments_sha256": assignment_hash(assignments)})
    calibration_path = artifact_dir / "residual_quantiles.json"
    calibration_path.write_bytes(canonical_bytes(table) + b"\n")
    calibration_sha = file_sha256(calibration_path)
    metadata.update({"state": "calibration_frozen", "calibration_sha256": calibration_sha})
    metadata_path.write_bytes(canonical_bytes(metadata) + b"\n")
    return accessed.transition(ProtocolState.CALIBRATION_FROZEN, calibration_sha256=calibration_sha)


def evaluate_final_once(dataset: pd.DataFrame, assignments: pd.DataFrame,
                        protocol: ProtocolManifest, config: TrainingConfig,
                        artifact_dir: Path, *, actor: str) -> tuple[ProtocolManifest, dict]:
    accessed = protocol.with_access("final_test", actor=actor, purpose="final_acceptance_evaluation")
    report_path = artifact_dir / "final_evaluation_report.json"
    if report_path.exists() or any(item["role"] == "final_test" for item in protocol.access_log):
        raise PermissionError("Teste final já foi consumido.")
    metadata_path = artifact_dir / "metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    calibration_path = artifact_dir / "residual_quantiles.json"
    if (metadata.get("model_sha256") != protocol.model_sha256
            or file_sha256(calibration_path) != protocol.calibration_sha256
            or metadata.get("assignments_sha256") != assignment_hash(assignments)):
        raise ValueError("Artefatos não correspondem ao protocolo congelado.")
    assert_job_dataset_scope(dataset, assignments, {"final_test"})
    _record_reserved_access(artifact_dir, accessed.access_log[-1])
    final = assigned_rows(dataset, assignments, fold_id="reserved", role="final_test")
    predicted = _predict(final, _load_model(metadata, artifact_dir), config)
    intervals = json.loads(calibration_path.read_text(encoding="utf-8"))
    report = {"artifact_schema_version": "temporal-final-report-v1",
              "protocol_version": protocol.protocol_version,
              "model_sha256": protocol.model_sha256,
              "calibration_sha256": protocol.calibration_sha256,
              "assignments_sha256": assignment_hash(assignments),
              "baseline": metrics_by_wind_and_plant(predicted, "baseline_mw"),
              "hybrid": metrics_by_wind_and_plant(predicted, "hybrid_mw"),
              "interval": interval_coverage(predicted, intervals, config.physical_curve),
              "acceptance_criteria": protocol.acceptance_criteria,
              "consumed_at_utc": datetime.now(timezone.utc).isoformat()}
    report["scientifically_approved"] = _accept(report, protocol.acceptance_criteria)
    report_path.write_bytes(canonical_bytes(report) + b"\n")
    report_sha = file_sha256(report_path)
    metadata.update({"state": "final_test_consumed", "final_report_sha256": report_sha,
                     "scientifically_approved": report["scientifically_approved"]})
    metadata_path.write_bytes(canonical_bytes(metadata) + b"\n")
    return accessed.transition(ProtocolState.FINAL_TEST_CONSUMED, final_report_sha256=report_sha), report


def _accept(report: dict, criteria: dict) -> bool:
    if not criteria:
        return False
    hybrid = report["hybrid"]["overall"]
    baseline = report["baseline"]["overall"]
    checks = []
    if "max_mae_mw" in criteria:
        checks.append(hybrid["mae_mw"] <= criteria["max_mae_mw"])
    if criteria.get("require_improvement_over_baseline"):
        checks.append(hybrid["mae_mw"] < baseline["mae_mw"])
    if "minimum_interval_coverage" in criteria:
        checks.append(report["interval"]["fraction"] >= criteria["minimum_interval_coverage"])
    return bool(checks and all(checks))


def homologate_operationally(protocol: ProtocolManifest, artifact_dir: Path,
                              *, evidence: dict) -> ProtocolManifest:
    """Record explicit product/ANAREDE acceptance; never infer it from metrics."""
    if protocol.state != ProtocolState.FINAL_TEST_CONSUMED:
        raise ValueError("Homologação exige teste final consumido.")
    required = {"approved_by", "approved_at_utc", "phase2_e2e_reference", "anarede_acceptance_reference"}
    if not required <= evidence.keys() or not all(str(evidence[key]).strip() for key in required):
        raise ValueError(f"Evidência de homologação incompleta: {sorted(required - evidence.keys())}.")
    metadata_path = artifact_dir / "metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if (metadata.get("state") != "final_test_consumed"
            or metadata.get("scientifically_approved") is not True
            or metadata.get("model_sha256") != protocol.model_sha256
            or metadata.get("calibration_sha256") != protocol.calibration_sha256
            or metadata.get("final_report_sha256") != protocol.final_report_sha256):
        raise ValueError("Bundle não corresponde ao protocolo avaliado.")
    updated = protocol.transition(ProtocolState.OPERATIONALLY_HOMOLOGATED)
    protocol_path = artifact_dir / "protocol_manifest.json"
    updated.write(protocol_path)
    metadata["state"] = "operationally_homologated"
    metadata["protocol_manifest_sha256"] = updated.digest()
    metadata["operational_homologation"] = {
        "status": True, **evidence, "model_sha256": protocol.model_sha256,
        "calibration_sha256": protocol.calibration_sha256,
        "final_report_sha256": protocol.final_report_sha256,
    }
    metadata_path.write_bytes(canonical_bytes(metadata) + b"\n")
    return updated
