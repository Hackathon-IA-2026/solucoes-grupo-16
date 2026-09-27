import numpy as np
import pandas as pd
import pytest

from training.causal.dml_plr import NuisanceConfig
from training.causal.independent_holdout import SCHEMA_VERSION, run_independent_holdout
from training.causal.spec import CausalEstimandSpec
from training.config import FeatureConfig, LightGBMConfig, TrainingConfig
from training.physical_curve import physical_power_mw


def _panel(start: str, hours: int, plants=("a", "b")) -> pd.DataFrame:
    timestamps = pd.date_range(start, periods=hours, freq="h", tz="UTC")
    rows = []
    for hour, timestamp in enumerate(timestamps):
        regime = np.sin(2 * np.pi * hour / 24)
        for plant_index, plant in enumerate(plants):
            wind = 8.0 + 1.6 * regime + 0.15 * plant_index
            density = 1.20 - 0.015 * regime + 0.002 * plant_index
            temperature = 292.0
            capacity = 100.0 + 10 * plant_index
            availability = 0.95
            baseline = physical_power_mw(
                pd.Series([wind]), pd.Series([capacity]),
                pd.Series([availability]), TrainingConfig().physical_curve,
            )[0]
            rows.append({
                "usina_id": plant,
                "timestamp_utc": timestamp,
                "u100": wind,
                "v100": 0.4,
                "temperature_2m": temperature,
                "surface_pressure": density * 287.05 * temperature,
                "capacidade_instalada_mw": capacity,
                "disponibilidade": availability,
                "era5_distance_km": 3.0 + plant_index,
                "geracao_referencia_mw": min(
                    baseline + (0.025 + 0.15 * (density - 1.20)) * capacity,
                    capacity,
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
    nuisance = NuisanceConfig(n_estimators=12, min_child_samples=5)
    return config, spec, nuisance


def test_independent_holdout_is_later_primary_is_unfiltered_and_unknown_uses_fallback():
    development = _panel("2024-01-01", 160)
    holdout = _panel("2024-01-07 16:00", 48)
    new_plant = _panel("2024-01-07 16:00", 48, plants=("new",))
    holdout = pd.concat([holdout, new_plant], ignore_index=True)
    first = holdout.index[0]
    holdout.loc[first, "disponibilidade"] = 0.2
    holdout.loc[first, "geracao_referencia_mw"] = 80.0
    config, spec, nuisance = _contracts()

    report, predictions, _, _ = run_independent_holdout(
        development, holdout, config, spec, gap_hours=6,
        nuisance_config=nuisance,
    )

    assert report["schema_version"] == SCHEMA_VERSION
    assert report["separation"]["holdout_used_for_training"] is False
    assert report["separation"]["overlapping_keys"] == 0
    assert report["separation"]["purged_development_rows"] == 12
    assert report["metrics"]["primary_all_physically_valid_holdout"]["rows"] == len(holdout)
    assert report["metrics"]["secondary_reference_within_available"]["rows"] < len(holdout)
    assert report["coverage"]["fallback_unknown_plant_rows"] == len(new_plant)
    unknown = predictions.loc[predictions.usina_id.eq("new")]
    assert unknown["fallback_reason"].eq("unknown_plant").all()
    assert np.allclose(unknown["dml_mw"], unknown["baseline_mw"])


def test_independent_holdout_rejects_temporal_overlap():
    development = _panel("2024-01-01", 160)
    holdout = _panel("2024-01-07", 48)
    config, spec, nuisance = _contracts()

    with pytest.raises(ValueError, match="sobrepostas|estritamente depois"):
        run_independent_holdout(
            development, holdout, config, spec,
            nuisance_config=nuisance,
        )
