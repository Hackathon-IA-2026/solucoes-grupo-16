"""Vectorized physical constraints shared by training and inference."""
from __future__ import annotations

import numpy as np

from training.config import PhysicalCurveConfig


def physical_power_mw(
    wind_speed_ms: object,
    capacity_mw: object,
    availability: object,
    config: PhysicalCurveConfig = PhysicalCurveConfig(),
) -> np.ndarray:
    """Return available physical power using a cubic ramp, always physically bounded."""
    wind = np.asarray(wind_speed_ms, dtype=float)
    capacity = np.asarray(capacity_mw, dtype=float)
    availability_arr = np.asarray(availability, dtype=float)
    available = np.clip(capacity * availability_arr, 0.0, None)
    result = np.zeros(np.broadcast(wind, available).shape, dtype=float)
    wind, available = np.broadcast_arrays(wind, available)
    ramp = (wind >= config.cut_in_ms) & (wind < config.rated_ms)
    plateau = (wind >= config.rated_ms) & (wind < config.cut_out_ms)
    denominator = config.rated_ms**3 - config.cut_in_ms**3
    result[ramp] = available[ramp] * (
        (wind[ramp] ** 3 - config.cut_in_ms**3) / denominator
    )
    result[plateau] = available[plateau]
    return np.clip(result, 0.0, available)


def apply_physical_bounds(
    baseline_mw: object,
    correction_mw: object,
    wind_speed_ms: object,
    capacity_mw: object,
    availability: object,
    config: PhysicalCurveConfig = PhysicalCurveConfig(),
) -> np.ndarray:
    """Clip ML-adjusted output and re-apply cut-in/cut-out after correction."""
    baseline = np.asarray(baseline_mw, dtype=float)
    correction = np.asarray(correction_mw, dtype=float)
    wind = np.asarray(wind_speed_ms, dtype=float)
    cap = np.asarray(capacity_mw, dtype=float)
    avail = np.asarray(availability, dtype=float)
    baseline, correction, wind, cap, avail = np.broadcast_arrays(
        baseline, correction, wind, cap, avail
    )
    available = np.clip(cap * avail, 0.0, None)
    output = np.clip(baseline + correction, 0.0, available)
    off = (wind < config.cut_in_ms) | (wind >= config.cut_out_ms)
    output[off] = 0.0
    return output
