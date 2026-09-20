from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import pandas as pd
import pytest
from training.physical_curve import physical_power_mw


@pytest.fixture
def synthetic_frame():
    """One deterministic 30-day plant; never emitted outside pytest temp paths."""
    hours = 720
    wind = np.resize(np.linspace(4, 18, 24), hours)
    baseline = physical_power_mw(wind, 100, 0.95)
    return pd.DataFrame({
        "usina_id": ["test-001"] * hours,
        "timestamp_utc": pd.date_range("2026-01-01", periods=hours, freq="h", tz="UTC"),
        "u100": wind, "v100": 0.0, "temperature_2m": 298.0, "surface_pressure": 101325.0,
        "capacidade_instalada_mw": 100.0, "disponibilidade": 0.95,
        "geracao_referencia_mw": np.maximum(baseline - 4, 0),
    })
