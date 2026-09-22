import numpy as np

from training.physical_curve import apply_physical_bounds, physical_power_mw


def test_wind_below_cut_in_is_zero():
    assert physical_power_mw([2.99], [100], [1])[0] == 0


def test_wind_at_rated_is_available_power():
    assert physical_power_mw([12], [100], [0.9])[0] == 90


def test_wind_at_or_above_cut_out_is_zero():
    assert np.all(physical_power_mw([25, 30], [100, 100], [1, 1]) == 0)


def test_negative_ml_correction_and_capacity_ceiling_are_bounded():
    low = apply_physical_bounds([10], [-20], [10], [100], [1])
    high = apply_physical_bounds([80], [40], [10], [100], [0.8])
    assert low[0] == 0
    assert high[0] == 80
