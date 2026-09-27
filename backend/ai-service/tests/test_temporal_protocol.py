from dataclasses import replace

import pandas as pd
import pytest

from training.protocol import (DevelopmentFold, ProtocolManifest, ProtocolState,
                               SCIENTIFIC_PREREQUISITES, TemporalSupport, TimeBlock,
                               sha256_json)
from training.splits import (assignment_hash, materialize_assignments, partition_rows,
                             snapshot_logical_hash)


HASH = "a" * 64


def manifest(state=ProtocolState.INFRASTRUCTURE_TEST):
    from training.config import TrainingConfig
    training_config = TrainingConfig(target="geracao_referencia_mw").serializable()
    block = lambda start, end: TimeBlock(f"2024-01-{start:02d}T00:00:00Z", f"2024-01-{end:02d}T00:00:00Z")
    return ProtocolManifest(
        protocol_version="fixture-v1", state=state, created_at_utc="2026-01-01T00:00:00Z",
        target_contract_sha256=HASH, eligibility_policy_sha256=HASH, snapshot_sha256=HASH,
        catalog_sha256=HASH, composition_sha256=HASH, source_sha256={"ons": HASH},
        folds=(DevelopmentFold("f1", block(1, 2), block(3, 4), block(5, 6)),
               DevelopmentFold("f2", block(1, 6), block(7, 8), block(9, 10))),
        calibration=block(11, 12), final_test=block(12, 13),
        feature_support=(TemporalSupport("causal_wind_history_6h", "timestamp", -6, 0, 0, 0),),
        purge_hours=6, purge_justification="Features usam vento de t-6 a t.",
        candidates=({"candidate_id": "lgb-1", "algorithm": "lightgbm", "parameters": {}},),
        candidate_budget=1, selection_rule={"primary_metric": "mae_mw", "aggregation": "mean",
                                             "tie_break": "candidate_id"},
        final_training_rule={"method": "median_best_iteration"},
        calibration_rule={"parameters": {"minimum_samples": 1}},
        acceptance_criteria={"require_improvement_over_baseline": True},
        scientific_prerequisites={name: True for name in SCIENTIFIC_PREREQUISITES},
        reproducibility={"random_seed": 42, "n_jobs": 1,
                         "training_config_sha256": sha256_json(training_config),
                         "runtime_constraints_sha256": HASH},
        minimums={"hours_per_role": 1, "plants_per_role": 1, "coverage_fraction": 0},
    )


def panel():
    timestamps = pd.date_range("2024-01-01", "2024-01-12 23:00", freq="h", tz="UTC")
    return pd.DataFrame([{"usina_id": plant, "timestamp_utc": timestamp, "value": float(index)}
                         for index, timestamp in enumerate(timestamps)
                         for plant in ("a", "b") if not (plant == "b" and timestamp.day == 3)])


def test_assignments_are_calendar_stable_and_order_independent():
    source = panel()
    first, report = materialize_assignments(source, manifest())
    shuffled, shuffled_report = materialize_assignments(source.sample(frac=1, random_state=7), manifest())
    assert assignment_hash(first) == assignment_hash(shuffled) == report["assignments_sha256"]
    assert report["assignments_sha256"] == shuffled_report["assignments_sha256"]
    without_gap = source.loc[~((source.usina_id == "a") & (source.timestamp_utc.dt.day == 2)
                               & (source.timestamp_utc.dt.hour == 3))]
    changed, _ = materialize_assignments(without_gap, manifest())
    common = set(first.row_fingerprint) & set(changed.row_fingerprint)
    assert first.loc[first.row_fingerprint.isin(common), ["fold_id", "role", "row_fingerprint"]].to_records(index=False).tolist() == \
        changed.loc[changed.row_fingerprint.isin(common), ["fold_id", "role", "row_fingerprint"]].to_records(index=False).tolist()


def test_boundaries_are_left_closed_and_hours_not_fragmented():
    assignments, _ = materialize_assignments(panel(), manifest())
    boundary = assignments.loc[(assignments.fold_id == "f1") &
                               (assignments.timestamp_utc == "2024-01-03T00:00:00+00:00")]
    assert set(boundary.role) == {"early_stopping"}
    assert boundary.groupby(["fold_id", "timestamp_utc"]).role.nunique().max() == 1


def test_block_summary_is_human_readable_and_external_rows_do_not_move_limits():
    source = panel()
    _, report = materialize_assignments(source, manifest())
    future = source.iloc[:2].copy()
    future["timestamp_utc"] = pd.date_range("2030-01-01", periods=2, freq="h", tz="UTC")
    _, extended = materialize_assignments(pd.concat([source, future]), manifest())
    assert report["blocks"] == extended["blocks"]
    block = report["blocks"][0]
    assert {"start_utc", "end_utc", "expected_hours", "observed_hours",
            "active_plants_observed", "rows", "fraction"} <= set(block)


def test_protocol_rejects_naive_overlap_and_gate_skips():
    with pytest.raises(ValueError, match="timezone"):
        TimeBlock("2024-01-01", "2024-01-02")
    with pytest.raises(ValueError, match="disjuntos"):
        DevelopmentFold("x", TimeBlock("2024-01-01T00:00Z", "2024-01-03T00:00Z"),
                        TimeBlock("2024-01-02T00:00Z", "2024-01-04T00:00Z"),
                        TimeBlock("2024-01-04T00:00Z", "2024-01-05T00:00Z"))
    with pytest.raises(ValueError, match="Transição"):
        manifest().transition(ProtocolState.MODEL_FROZEN)


def test_scientific_protocol_rejects_exposed_final_period():
    with pytest.raises(ValueError, match="exposto"):
        replace(manifest(ProtocolState.PROTOCOL_FROZEN), exposed_periods=({
            "start_utc": "2024-01-12T00:00:00Z",
            "end_utc": "2024-01-13T00:00:00Z",
            "reason": "resultado consultado",
        },))


def test_scientific_protocol_rejects_pending_prerequisites_and_config_drift():
    with pytest.raises(ValueError, match="pendentes"):
        replace(manifest(), state=ProtocolState.PROTOCOL_FROZEN,
                scientific_prerequisites={name: name != "target_contract_approved"
                                          for name in SCIENTIFIC_PREREQUISITES})
    protocol = manifest(ProtocolState.PROTOCOL_FROZEN)
    from training.config import TrainingConfig
    with pytest.raises(ValueError, match="Configuração de treino"):
        protocol.validate_reproducibility(
            training_config=TrainingConfig(target="geracao_referencia_mw", random_state=7).serializable())


def test_runtime_feature_lookback_must_match_manifest():
    with pytest.raises(ValueError, match="lookback"):
        manifest().validate_feature_contract(required_history_hours=7, most_required=False)


def test_purge_is_derived_from_horizon_label_and_transform_support():
    support = (TemporalSupport("future_label", "timestamp", 0, 0, 0, 4,
                               label_duration_hours=3, transformation_lookback_hours=2),)
    with pytest.raises(ValueError, match="Purga menor"):
        replace(manifest(), feature_support=support, purge_hours=6)


def test_tuning_fit_uses_only_train_and_stopping_and_candidates_share_hashes(
        synthetic_frame, monkeypatch):
    from training.config import TrainingConfig
    from training.splits import assigned_rows, partition_rows, snapshot_logical_hash
    from training.tune import tune
    import training.tune as tune_module

    frame = synthetic_frame.copy()
    frame["timestamp_utc"] = frame.timestamp_utc - pd.DateOffset(years=2)
    candidates = (
        {"candidate_id": "lgb", "algorithm": "lightgbm", "parameters": {}},
        {"candidate_id": "xgb", "algorithm": "xgboost", "parameters": {}},
    )
    protocol = replace(manifest(), candidates=candidates, candidate_budget=2,
                       snapshot_sha256=snapshot_logical_hash(frame))
    assignments, _ = materialize_assignments(frame, protocol)
    development = partition_rows(frame, assignments, {"train", "early_stopping", "evaluation"})
    calls = []

    class FakeEstimator:
        best_iteration = 7

        def fit(self, train_x, train_y, stopping_x, stopping_y):
            calls.append((set(train_x.index), set(stopping_x.index)))

        def predict(self, features):
            return pd.Series(0.0, index=features.index).to_numpy()

    monkeypatch.setattr(tune_module, "create_estimator", lambda *args, **kwargs: FakeEstimator())
    result = tune(development, assignments, protocol,
                  TrainingConfig(target="geracao_referencia_mw"))
    assert len(calls) == len(candidates) * len(protocol.folds)
    for index, (train_indices, stopping_indices) in enumerate(calls):
        fold = protocol.folds[index % len(protocol.folds)]
        expected_train = set(assigned_rows(development, assignments, fold_id=fold.fold_id,
                                           role="train").index)
        expected_stopping = set(assigned_rows(development, assignments, fold_id=fold.fold_id,
                                              role="early_stopping").index)
        evaluation = set(assigned_rows(development, assignments, fold_id=fold.fold_id,
                                       role="evaluation").index)
        assert train_indices == expected_train
        assert stopping_indices == expected_stopping
        assert train_indices.isdisjoint(stopping_indices | evaluation)
        assert stopping_indices.isdisjoint(evaluation)
    hashes = {(item["assignments_sha256"], item["feature_order_sha256"])
              for item in result["candidates"]}
    assert len(hashes) == 1


def test_reserved_access_requires_frozen_predecessor():
    with pytest.raises(ValueError, match="congelar"):
        manifest().with_access("calibration", actor="test", purpose="test")
    frozen = replace(manifest(), state=ProtocolState.MODEL_FROZEN, assignments_sha256=HASH,
                     selected_candidate_id="lgb-1", model_sha256=HASH)
    accessed = frozen.with_access("calibration", actor="test", purpose="test")
    assert accessed.access_log[-1]["role"] == "calibration"


def test_protocol_jobs_keep_reservations_separate(synthetic_frame, tmp_path):
    from app.predictor import Predictor
    from training.config import TrainingConfig
    from training.protocol_jobs import (calibrate_frozen_model, evaluate_final_once,
                                        homologate_operationally, train_frozen_model)
    from training.tune import tune

    synthetic_frame = synthetic_frame.copy()
    synthetic_frame["timestamp_utc"] = synthetic_frame.timestamp_utc - pd.DateOffset(years=2)
    protocol = replace(manifest(ProtocolState.PROTOCOL_FROZEN),
                       snapshot_sha256=snapshot_logical_hash(synthetic_frame))
    assignments, _ = materialize_assignments(synthetic_frame, protocol)
    development = partition_rows(synthetic_frame, assignments, {"train", "early_stopping", "evaluation"})
    calibration = partition_rows(synthetic_frame, assignments, {"calibration"})
    final_test = partition_rows(synthetic_frame, assignments, {"final_test"})
    config = TrainingConfig(target="geracao_referencia_mw")
    with pytest.raises(PermissionError, match="fora dos papéis"):
        tune(synthetic_frame, assignments, protocol, config)
    changed = development.copy()
    changed.loc[changed.index[0], "geracao_referencia_mw"] += 1
    with pytest.raises(ValueError, match="fingerprints"):
        tune(changed, assignments, protocol, config)
    tuning = tune(development, assignments, protocol, config)
    tampered = {**tuning, "selected_candidate_id": "not-authorized"}
    with pytest.raises(ValueError, match="selecionado"):
        train_frozen_model(development, assignments, protocol, config, tampered,
                           tmp_path / "tampered-artifact")
    artifact = tmp_path / "protocol-artifact"
    model_frozen = train_frozen_model(development, assignments, protocol, config,
                                      tuning, artifact)
    assert model_frozen.state == ProtocolState.MODEL_FROZEN
    assert not Predictor.from_artifacts(artifact).approved
    calibration_frozen = calibrate_frozen_model(
        calibration, assignments, model_frozen, config, artifact, actor="pytest")
    final, report = evaluate_final_once(
        final_test, assignments, calibration_frozen, config, artifact, actor="pytest")
    assert final.state == ProtocolState.FINAL_TEST_CONSUMED
    assert isinstance(report["scientifically_approved"], bool)
    with pytest.raises((PermissionError, ValueError)):
        evaluate_final_once(final_test, assignments, final, config, artifact, actor="pytest")
    homologated = homologate_operationally(final, artifact, evidence={
        "approved_by": "specialist", "approved_at_utc": "2026-09-26T12:00:00Z",
        "phase2_e2e_reference": "fixture-e2e", "anarede_acceptance_reference": "fixture-anarede",
    })
    assert homologated.state == ProtocolState.OPERATIONALLY_HOMOLOGATED
    assert Predictor.from_artifacts(artifact).approved
    from training.experiment_store import read_bundle
    bundle, _ = read_bundle(artifact)
    assert {"model.txt", "reserved_access_log.json", "final_evaluation_report.json"} <= bundle.keys()
    report_file = artifact / "final_evaluation_report.json"
    report_file.write_bytes(report_file.read_bytes() + b" ")
    assert not Predictor.from_artifacts(artifact).approved


def test_xgboost_adapter_uses_exclusive_stopping_set(tmp_path):
    pytest.importorskip("xgboost")
    from training.estimators import create_estimator
    x_train = pd.DataFrame({"feature": range(30)}, dtype=float)
    y_train = pd.Series(range(30), dtype=float)
    x_stop = pd.DataFrame({"feature": range(30, 40)}, dtype=float)
    y_stop = pd.Series(range(30, 40), dtype=float)
    estimator = create_estimator({"candidate_id": "xgb", "algorithm": "xgboost",
                                  "parameters": {"n_estimators": 5, "max_depth": 2}})
    estimator.fit(x_train, y_train, x_stop, y_stop)
    assert estimator.predict(x_stop).shape == (10,)
    estimator.save(tmp_path / "model.ubj")
    assert (tmp_path / "model.ubj").exists()
