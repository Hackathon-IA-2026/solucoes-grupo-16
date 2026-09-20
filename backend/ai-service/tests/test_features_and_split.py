import pandas as pd

from training.features import FEATURE_COLUMNS, feature_matrix
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
