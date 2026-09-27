from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from training.causal.dml_plr import DMLPLRModel, NuisanceConfig, fit_dml_plr
from training.causal.spec import (
    TEMPORAL_MOST_CONTROLS,
    TEMPORAL_MOST_CONTROL_SET,
    TEMPORAL_MOST_SCHEMA_VERSION,
    CausalEstimandSpec,
)
from training.causal.temporal_crossfit import expanding_time_splits
from training.config import FeatureConfig
from training.features import add_features


def _causal_panel(theta=0.8, hours=480, plants=("a", "b", "c")):
    rng = np.random.default_rng(1234)
    timestamps = pd.date_range("2024-01-01", periods=hours, freq="h", tz="UTC")
    rows = []
    for hour, timestamp in enumerate(timestamps):
        wind_regime = np.sin(2 * np.pi * hour / 24)
        for plant_index, plant in enumerate(plants):
            wind = 8.0 + 1.5 * wind_regime + 0.2 * plant_index
            density_noise = rng.normal(0, 0.012)
            density = 1.20 - 0.025 * wind_regime + 0.004 * plant_index + density_noise
            temperature = 290.0
            pressure = density * 287.05 * temperature
            structural = 0.03 * wind + 0.01 * plant_index
            outcome = structural + theta * density + rng.normal(0, 0.008)
            rows.append({
                "usina_id": plant,
                "timestamp_utc": timestamp,
                "u100": wind,
                "v100": 0.4,
                "temperature_2m": temperature,
                "surface_pressure": pressure,
                "capacidade_instalada_mw": 100.0 + 10 * plant_index,
                "disponibilidade": 0.95,
                "era5_distance_km": 5.0 + plant_index,
                "residual_cf": outcome,
            })
    return pd.DataFrame(rows)


def _fast_config():
    return NuisanceConfig(n_estimators=80, learning_rate=0.06, min_child_samples=20)


def test_estimand_rejects_treatment_parents_and_target_leakage():
    with pytest.raises(ValueError, match="proibidos"):
        CausalEstimandSpec(controls=("wind_speed_100m", "usina_id", "surface_pressure"))
    with pytest.raises(ValueError, match="proibidos"):
        CausalEstimandSpec(controls=("wind_speed_100m", "usina_id", "residual_cf"))


def test_crossfit_is_forward_only_and_never_fragments_an_hour():
    frame = _causal_panel(hours=48, plants=("a", "b"))
    folds = expanding_time_splits(frame.timestamp_utc, n_splits=3, gap_hours=1)
    evaluated = set()
    for fold in folds:
        train_times = set(frame.iloc[fold.train_indices].timestamp_utc)
        evaluation_times = set(frame.iloc[fold.evaluation_indices].timestamp_utc)
        assert max(train_times) < min(evaluation_times)
        assert train_times.isdisjoint(evaluation_times)
        assert evaluated.isdisjoint(evaluation_times)
        evaluated |= evaluation_times
        assert frame.iloc[fold.evaluation_indices].groupby("timestamp_utc").usina_id.nunique().eq(2).all()


def test_dml_recovers_known_effect_and_round_trips_artifact(tmp_path):
    frame = _causal_panel()
    spec = CausalEstimandSpec(
        n_crossfit_splits=3,
        minimum_oof_rows=500,
        inference_cluster_hours=24,
        status="infrastructure_test",
    )
    model = fit_dml_plr(frame, spec, _fast_config())
    assert model.theta == pytest.approx(0.8, abs=0.2)
    assert model.diagnostics["rows_oof"] >= 500
    assert model.diagnostics["treatment_residual_std"] > spec.minimum_treatment_residual_std
    before = model.predict_residual_cf(frame.tail(20))
    artifact = tmp_path / "dml"
    metadata = model.save(artifact)
    assert metadata["status"] == "infrastructure_test"
    loaded = DMLPLRModel.load(artifact)
    assert loaded.predict_residual_cf(frame.tail(20)) == pytest.approx(before)


def test_dml_blocks_when_treatment_has_no_residual_overlap():
    frame = _causal_panel(hours=240)
    frame["surface_pressure"] = 1.2 * 287.05 * frame["temperature_2m"]
    spec = CausalEstimandSpec(
        n_crossfit_splits=3,
        minimum_oof_rows=300,
        minimum_treatment_residual_std=1e-3,
        status="infrastructure_test",
    )
    with pytest.raises(ValueError, match="overlap"):
        fit_dml_plr(frame, spec, _fast_config())


def test_dml_bundle_rejects_tampered_model(tmp_path):
    frame = _causal_panel(hours=240)
    spec = CausalEstimandSpec(
        n_crossfit_splits=2,
        minimum_oof_rows=300,
        inference_cluster_hours=24,
        status="infrastructure_test",
    )
    artifact = tmp_path / "dml"
    fit_dml_plr(frame, spec, _fast_config()).save(artifact)
    (artifact / "outcome_model.txt").write_text("tampered", encoding="utf-8")
    with pytest.raises(ValueError, match="Hash divergente"):
        DMLPLRModel.load(artifact)


def test_dml_binds_temporal_most_contract_and_uses_six_hour_gap(tmp_path):
    feature_config = FeatureConfig(most_enabled=True, require_complete_history=True)
    prepared = add_features(_causal_panel(), feature_config)
    spec = CausalEstimandSpec(
        n_crossfit_splits=3,
        crossfit_gap_hours=0,
        minimum_oof_rows=500,
        inference_cluster_hours=24,
        status="infrastructure_test",
    )
    model = fit_dml_plr(
        prepared, spec, _fast_config(), feature_config=feature_config,
    )
    assert model.diagnostics["effective_crossfit_gap_hours"] == 6
    assert model.diagnostics["rows_excluded_incomplete_history"] == 18
    artifact = tmp_path / "dml-temporal"
    metadata = model.save(artifact)
    assert metadata["feature_config"]["most_enabled"] is True
    assert metadata["required_history_hours"] == 6
    loaded = DMLPLRModel.load(artifact)
    assert loaded.feature_config == feature_config
    eligible_tail = prepared.loc[prepared.temporal_context_complete.eq(1)].tail(20)
    assert loaded.predict_residual_cf(eligible_tail) == pytest.approx(
        model.predict_residual_cf(eligible_tail)
    )


def test_dml_rejects_incomplete_history_and_unknown_plants():
    feature_config = FeatureConfig(require_complete_history=True)
    prepared = add_features(_causal_panel(hours=240), feature_config)
    spec = CausalEstimandSpec(
        n_crossfit_splits=2,
        minimum_oof_rows=300,
        status="infrastructure_test",
    )
    model = fit_dml_plr(
        prepared, spec, _fast_config(), feature_config=feature_config,
    )
    with pytest.raises(ValueError, match="histórico temporal completo"):
        model.predict_residual_cf(_causal_panel(hours=3))
    unknown = prepared.loc[prepared.temporal_context_complete.eq(1)].tail(10).copy()
    unknown["usina_id"] = "unknown"
    with pytest.raises(ValueError, match="usinas desconhecidas"):
        model.predict_residual_cf(unknown)


def test_temporal_most_v2_is_explicit_and_does_not_mutate_v1():
    with pytest.raises(ValueError, match="não suportados"):
        CausalEstimandSpec(controls=("wind_speed_hub_m", "usina_id"))
    spec = CausalEstimandSpec(
        schema_version=TEMPORAL_MOST_SCHEMA_VERSION,
        estimand_id="temporal-most-test-v2",
        control_set_version=TEMPORAL_MOST_CONTROL_SET,
        controls=TEMPORAL_MOST_CONTROLS,
        n_crossfit_splits=3,
        minimum_oof_rows=500,
        inference_cluster_hours=24,
        status="infrastructure_test",
    )
    with pytest.raises(ValueError, match="most_enabled"):
        fit_dml_plr(_causal_panel(), spec, _fast_config())
    feature_config = FeatureConfig(most_enabled=True, require_complete_history=True)
    model = fit_dml_plr(
        _causal_panel(), spec, _fast_config(), feature_config=feature_config,
    )
    assert np.isfinite(model.theta)
    assert model.diagnostics["effective_crossfit_gap_hours"] == 6
    assert "wind_speed_mean_6h" in model.spec.controls


def test_all_versioned_estimand_examples_are_loadable():
    root = Path(__file__).resolve().parents[1] / "training" / "causal"
    specs = [
        CausalEstimandSpec.load(root / "estimand.example.json"),
        CausalEstimandSpec.load(root / "estimand.temporal-most-v2.example.json"),
        CausalEstimandSpec.load(
            root / "estimand.temporal-most-v2-with-availability.example.json"
        ),
    ]
    assert [spec.control_set_version for spec in specs] == [
        "legacy-v1", "temporal-most-v2", "temporal-most-v2",
    ]
    assert "disponibilidade" not in specs[1].controls
    assert "disponibilidade" in specs[2].controls
