import numpy as np
import pandas as pd
import pytest

from training.causal.annual_backtest import _grid_user_metrics, _periods_are_contiguous


def test_annual_period_requires_twelve_ordered_contiguous_months():
    labels = [str(period) for period in pd.period_range("2024-10", periods=12, freq="M")]
    _periods_are_contiguous(labels)

    with pytest.raises(ValueError, match="12 meses"):
        _periods_are_contiguous(labels[:-1])
    with pytest.raises(ValueError, match="ordenados|contíguos"):
        _periods_are_contiguous(labels[:5] + labels[6:] + ["2025-10"])


def test_grid_user_metrics_match_hourly_scenario_semantics():
    hourly = pd.DataFrame({
        "timestamp_utc": pd.date_range("2025-01-01", periods=4, freq="h", tz="UTC"),
        "target_mw": [100.0, 200.0, 300.0, 400.0],
        "prediction_mw": [90.0, 220.0, 300.0, 360.0],
        "capacidade_instalada_mw": [500.0] * 4,
    })

    metrics = _grid_user_metrics(hourly)

    assert metrics["hours_within_10_percent_fraction"] == pytest.approx(1.0)
    assert metrics["hours_within_5_percent_fraction"] == pytest.approx(0.25)
    assert metrics["actual_peak_mw"] == 400.0
    assert metrics["prediction_at_actual_peak_mw"] == 360.0
    assert metrics["signed_error_at_actual_peak_fraction"] == pytest.approx(-0.10)
    assert np.isfinite(metrics["hourly_r2"])
