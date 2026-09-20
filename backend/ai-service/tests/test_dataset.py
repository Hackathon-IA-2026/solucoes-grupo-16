import json
import subprocess
import sys

import numpy as np
import pandas as pd
import pytest

from training.build_dataset import DatasetValidationError, prepare_hourly_dataset
from training.config import ColumnConfig, TrainingConfig

CONFIG = TrainingConfig(target="geracao_referencia_mw")


def test_custom_target_mapping(synthetic_frame):
    mapped = synthetic_frame.rename(columns={"geracao_referencia_mw": "campo_validado"})
    config = TrainingConfig(target=CONFIG.target, columns=ColumnConfig(geracao_referencia_mw="campo_validado"))
    data, report = prepare_hourly_dataset(mapped, config)
    assert config.target_column() in data
    assert report["missing_required_columns"] == []
    assert report["coverage"]["fraction"] == 1


@pytest.mark.parametrize("column,value", [("capacidade_instalada_mw", np.inf), ("disponibilidade", np.nan),
    ("geracao_referencia_mw", np.nan), ("temperature_2m", np.inf), ("u100", 51),
    ("surface_pressure", 0), ("era5_distance_km", -1)])
def test_exclusions_are_reported(synthetic_frame, column, value):
    synthetic_frame.loc[0, column] = value
    data, report = prepare_hourly_dataset(synthetic_frame, CONFIG)
    assert len(data) == 719
    assert report["rows_excluded"] == 1
    assert report["coverage"]["missing_hours"] == 1


def test_duplicate_keys_not_silently_averaged(synthetic_frame):
    duplicated = pd.concat([synthetic_frame, synthetic_frame.iloc[:1]], ignore_index=True)
    data, report = prepare_hourly_dataset(duplicated, CONFIG)
    assert len(data) == 719
    assert report["duplicate_logical_keys"] == 1
    assert report["exclusions"]["duplicate_logical_key_rows"] == 2


def test_missing_half_hour_excludes_whole_hour(synthetic_frame):
    half = synthetic_frame.iloc[:1].copy()
    half["timestamp_utc"] += pd.Timedelta(minutes=30)
    half[CONFIG.target] = np.nan
    data, report = prepare_hourly_dataset(pd.concat([synthetic_frame, half], ignore_index=True), CONFIG)
    assert len(data) == 719
    assert report["exclusions"]["additional_rows_in_invalid_hour"] == 1


def test_hourly_mean_and_explicit_timezone(synthetic_frame):
    half = synthetic_frame.iloc[:1].copy()
    half["timestamp_utc"] += pd.Timedelta(minutes=30)
    half[CONFIG.target] = 10.0
    data, _ = prepare_hourly_dataset(pd.concat([synthetic_frame, half], ignore_index=True), CONFIG)
    assert data.iloc[0][CONFIG.target] == pytest.approx((synthetic_frame.iloc[0][CONFIG.target] + 10) / 2)
    naive = synthetic_frame.copy()
    naive["timestamp_utc"] = naive.timestamp_utc.dt.tz_localize(None)
    with pytest.raises(DatasetValidationError):
        prepare_hourly_dataset(naive, CONFIG)
    data, _ = prepare_hourly_dataset(naive, TrainingConfig(target=CONFIG.target, source_timezone="America/Sao_Paulo"))
    assert data.timestamp_utc.iloc[0].hour == 3


def test_single_plant_selection(synthetic_frame):
    other = synthetic_frame.assign(usina_id="other")
    source = pd.concat([synthetic_frame, other], ignore_index=True)
    with pytest.raises(DatasetValidationError, match="uma usina"):
        prepare_hourly_dataset(source, CONFIG)
    data, _ = prepare_hourly_dataset(source, TrainingConfig(target=CONFIG.target, usina_id="test-001"))
    assert len(data) == 720


def test_invalid_schema_cli_still_writes_report(tmp_path):
    source = tmp_path / "invalid.csv"
    pd.DataFrame({"usina_id": ["test"]}).to_csv(source, index=False)
    report = tmp_path / "report.json"
    result = subprocess.run([sys.executable, "-m", "training.build_dataset", "--input", str(source),
                             "--report", str(report)], capture_output=True, text=True, timeout=30)
    assert result.returncode == 2
    assert "timestamp_utc" in json.loads(report.read_text())["missing_required_columns"]
