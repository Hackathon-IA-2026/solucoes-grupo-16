import pandas as pd

import numpy as np
import pytest

from training.config import FeatureConfig
from training.features import FEATURE_COLUMNS, add_features, feature_matrix
from training.train import temporal_split


def _frame(hours=10):
    return pd.DataFrame({
        "usina_id": ["u1"] * hours,
        "timestamp_utc": pd.date_range("2026-01-01", periods=hours, freq="h", tz="UTC"),
        "u100": [6.0] * hours, "v100": [1.0] * hours,
        "temperature_2m": [298.0] * hours, "surface_pressure": [101325.0] * hours,
        "capacidade_instalada_mw": [50.0] * hours, "disponibilidade": [1.0] * hours,
    })


def test_feature_order_is_identical_for_training_and_inference_input():
    matrix = feature_matrix(_frame())
    assert matrix.columns.tolist() == FEATURE_COLUMNS
    assert matrix.shape[1] == len(FEATURE_COLUMNS)


def test_temporal_split_has_no_timestamp_leakage():
    train, validation, test, _ = temporal_split(_frame())
    assert train.timestamp_utc.max() < validation.timestamp_utc.min() < test.timestamp_utc.min()
    assert set(train.timestamp_utc).isdisjoint(test.timestamp_utc)


def test_rolling_features_are_causal_exact_hourly_and_order_independent():
    source = _frame(10)
    source["u100"] = range(10)
    ordered = add_features(source)
    shuffled = add_features(source.sample(frac=1, random_state=7)).sort_values("timestamp_utc")
    speeds = np.hypot(np.arange(10), 1.0)
    assert ordered.iloc[6].wind_speed_mean_3h == pytest.approx(speeds[4:7].mean())
    assert ordered.iloc[6].wind_speed_mean_6h == pytest.approx(speeds[1:7].mean())
    assert ordered.iloc[6].wind_speed_gradient_6h == pytest.approx((speeds[6] - speeds[0]) / 6)
    assert ordered.iloc[6].temporal_context_complete == 1
    columns = [name for name in FEATURE_COLUMNS if "mean_" in name or "gradient_" in name or "complete" in name]
    pd.testing.assert_frame_equal(ordered[columns].reset_index(drop=True),
                                  shuffled[columns].reset_index(drop=True))
    future_changed = source.copy()
    future_changed.loc[7:, "u100"] = 40
    assert add_features(future_changed).loc[6, "wind_speed_mean_6h"] == ordered.loc[6, "wind_speed_mean_6h"]


def test_rolling_features_do_not_bridge_a_gap():
    source = _frame(10).drop(index=4)
    enriched = add_features(source)
    row = enriched.loc[enriched.timestamp_utc.eq(pd.Timestamp("2026-01-01T06:00:00Z"))].iloc[0]
    assert row.history_complete_3h == 0
    assert np.isnan(row.wind_speed_mean_3h)


def test_most_identity_at_100m_and_explicit_missing_fallback():
    source = _frame(1).assign(hub_height_m=100.0, surface_roughness_m=0.1,
                              monin_obukhov_length_m=-200.0)
    enabled = FeatureConfig(most_enabled=True)
    enriched = add_features(source, enabled)
    assert enriched.iloc[0].wind_speed_hub_m == pytest.approx(np.hypot(6, 1))
    assert enriched.iloc[0].most_applied == 1
    missing = add_features(_frame(1), enabled)
    assert missing.iloc[0].wind_speed_hub_m == pytest.approx(np.hypot(6, 1))
    assert missing.iloc[0].most_missing == 1


@pytest.mark.parametrize("length", [-200.0, 200.0, 1_000_000.0])
def test_most_stability_regimes_are_finite_and_raise_150m_wind(length):
    source = _frame(1).assign(hub_height_m=150.0, surface_roughness_m=0.1,
                              monin_obukhov_length_m=length)
    row = add_features(source, FeatureConfig(most_enabled=True)).iloc[0]
    assert np.isfinite(row.wind_speed_hub_m)
    assert row.wind_speed_hub_m > row.wind_speed_100m
