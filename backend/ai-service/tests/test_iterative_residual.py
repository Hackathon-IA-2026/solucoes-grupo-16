import numpy as np
import pandas as pd
import pytest

from training.causal.dml_plr import NuisanceConfig
from training.causal.iterative_residual import (
    ResidualCandidate,
    SCHEMA_VERSION,
    _paired_day_bootstrap,
    run_iterative_residual,
)
from training.causal.spec import CausalEstimandSpec
from training.config import FeatureConfig, LightGBMConfig, TrainingConfig
from training.physical_curve import physical_power_mw


def _panel(start: str, hours: int, drift: float, plants=("a", "b")) -> pd.DataFrame:
    timestamps = pd.date_range(start, periods=hours, freq="h", tz="UTC")
    rows = []
    config = TrainingConfig().physical_curve
    for hour, timestamp in enumerate(timestamps):
        daily = np.sin(2 * np.pi * hour / 24)
        for plant_index, plant in enumerate(plants):
            wind = 7.5 + 1.8 * daily + plant_index * 0.2
            capacity = 100.0 + plant_index * 10.0
            availability = 0.95
            baseline = physical_power_mw(
                [wind], [capacity], [availability], config
            )[0]
            rows.append({
                "usina_id": plant,
                "timestamp_utc": timestamp,
                "u100": wind,
                "v100": 0.35,
                "temperature_2m": 291.0 + daily,
                "surface_pressure": 101_000.0 - 120.0 * daily,
                "capacidade_instalada_mw": capacity,
                "disponibilidade": availability,
                "era5_distance_km": 2.0 + plant_index,
                "geracao_referencia_mw": np.clip(
                    baseline + capacity * (drift + 0.01 * daily), 0, capacity * availability
                ),
            })
    return pd.DataFrame(rows)


def _contracts():
    config = TrainingConfig(
        target="geracao_referencia_mw",
        allow_multiple_plants=True,
        features=FeatureConfig(require_complete_history=False),
        lightgbm=LightGBMConfig(n_estimators=12, min_child_samples=5),
    )
    spec = CausalEstimandSpec(
        n_crossfit_splits=2,
        crossfit_gap_hours=2,
        minimum_oof_rows=20,
        inference_cluster_hours=12,
        status="infrastructure_test",
    )
    nuisance = NuisanceConfig(n_estimators=8, min_child_samples=5)
    candidates = (
        ResidualCandidate("tiny", 12, 0.05, 7, 5, 1.0),
    )
    return config, spec, nuisance, candidates


def test_sequential_residual_keeps_april_untouched_and_reports_frozen_checkpoints():
    config, spec, nuisance, candidates = _contracts()
    report, january, april, models = run_iterative_residual(
        _panel("2024-08-01", 120, 0.01),
        _panel("2024-09-01", 120, 0.03),
        _panel("2026-01-01", 120, 0.04),
        _panel("2026-04-01", 120, 0.05),
        config,
        spec,
        candidates=candidates,
        scales=(0.5, 1.0),
        gap_hours=2,
        bootstrap_samples=100,
        nuisance_config=nuisance,
    )

    assert report["schema_version"] == SCHEMA_VERSION
    assert report["separation"]["april_used_for_training_or_selection"] is False
    assert report["adaptation"]["september"]["split"]["validation"]["start_utc"].startswith("2024-09")
    assert report["adaptation"]["january_after_frozen_evaluation"]["split"]["validation"]["start_utc"].startswith("2026-01")
    assert "lightgbm_aug_plus_sep_residual" in report["checkpoints"]["january_2026"]["metrics_primary_all_physically_valid"]
    assert "lightgbm_aug_sep_mw" in january
    assert "lightgbm_aug_sep_scalar_mw" in january
    assert "lightgbm_aug_sep_jan_mw" in april
    assert "lightgbm_aug_sep_jan_scalar_mw" in april
    assert report["separation"]["first_checkpoint_before_exposure"] == "January 2026"
    assert report["annual_test_readiness"]["next_period_must_remain_untouched"] is True
    assert models["base_lightgbm"] is not None


def test_day_bootstrap_is_deterministic_and_paired():
    timestamps = pd.date_range("2026-01-01", periods=72, freq="h", tz="UTC")
    frame = pd.DataFrame({
        "timestamp_utc": timestamps,
        "target_mw": np.full(72, 100.0),
        "before_mw": np.full(72, 80.0),
        "after_mw": np.full(72, 90.0),
    })
    first = _paired_day_bootstrap(
        frame, "before_mw", "after_mw", samples=100, random_state=42
    )
    second = _paired_day_bootstrap(
        frame, "before_mw", "after_mw", samples=100, random_state=42
    )

    assert first == second
    assert first["improvement_percentage_points"] == pytest.approx(10.0)
    assert first["statistically_supported_improvement"] is True


def test_sequential_residual_rejects_overlap():
    config, spec, nuisance, candidates = _contracts()
    development = _panel("2024-08-01", 120, 0.01)
    with pytest.raises(ValueError, match="sobrepostas|ordem temporal"):
        run_iterative_residual(
            development,
            development.copy(),
            _panel("2026-01-01", 120, 0.04),
            _panel("2026-04-01", 120, 0.05),
            config,
            spec,
            candidates=candidates,
            scales=(0.5,),
            bootstrap_samples=100,
            nuisance_config=nuisance,
        )
