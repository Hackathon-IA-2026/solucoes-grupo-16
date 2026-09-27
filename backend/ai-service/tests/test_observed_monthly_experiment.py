"""The observed-generation challenger must not read ex-post ONS fields as inputs."""
from __future__ import annotations

import pandas as pd
from pandas.testing import assert_frame_equal

from training.features import FEATURE_COLUMNS
from training.observed_monthly_experiment import prepare_features


def test_observed_target_and_ons_availability_do_not_change_features() -> None:
    source = pd.DataFrame({
        "usina_id": ["ONS_A"] * 7,
        "timestamp_utc": pd.date_range("2024-08-01T00:00:00Z", periods=7, freq="h"),
        "capacidade_instalada_mw": [100.] * 7,
        "u100": [6.] * 7, "v100": [2.] * 7,
        "temperature_2m": [295.] * 7, "surface_pressure": [100_000.] * 7,
        "geracao_verificada_mw": [10.] * 7,
        "geracao_referencia_mw": [80.] * 7,
        "disponibilidade": [.1] * 7,
    })
    changed = source.copy()
    changed["geracao_verificada_mw"] = 90.
    changed["geracao_referencia_mw"] = 2.
    changed["disponibilidade"] = .9
    original, altered = prepare_features(source), prepare_features(changed)
    assert_frame_equal(original[FEATURE_COLUMNS], altered[FEATURE_COLUMNS])
    assert original.baseline_mw.equals(altered.baseline_mw)
    assert original.disponibilidade.eq(1.).all()
