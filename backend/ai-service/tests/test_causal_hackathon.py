import json

import numpy as np
import pandas as pd
import pytest

from app.experimental_insights import ExperimentalInsightsService
from training.causal.dml_plr import NuisanceConfig
from training.causal.hackathon import SCHEMA_VERSION, build_hackathon_insights
from training.causal.prepare_data import build_exploratory_snapshot
from training.causal.spec import CausalEstimandSpec
from training.config import FeatureConfig, LightGBMConfig, TrainingConfig
from training.physical_curve import physical_power_mw


def test_exploratory_snapshot_reports_and_applies_eligibility_rules():
    restriction = pd.DataFrame({
        "id_ons": ["u1"] * 4,
        "din_instante": [
            "2024-01-01 00:00:00", "2024-01-01 00:30:00",
            "2024-01-01 01:00:00", "2024-01-01 01:30:00",
        ],
        "val_disponibilidade": [45.0, 45.0, 40.0, 40.0],
        "val_geracaoreferencia": [35.0, 35.0, 48.0, 48.0],
        "val_geracao": [30.0, 30.0, 38.0, 38.0],
    })
    catalog = pd.DataFrame({
        "id_ons": ["u1"],
        "capacidade_instalada_mw": [50.0],
    })
    weather = pd.DataFrame({
        "usina_id": ["u1", "u1"],
        "timestamp_utc": pd.to_datetime(
            ["2024-01-01T03:00:00Z", "2024-01-01T04:00:00Z"]
        ),
        "u100": [7.0, 8.0],
        "v100": [1.0, 1.0],
        "temperature_2m": [295.0, 295.0],
        "surface_pressure": [101_000.0, 101_000.0],
        "era5_distance_km": [4.0, 4.0],
    })

    snapshot, report = build_exploratory_snapshot(restriction, weather, catalog)

    assert len(snapshot) == 1
    assert snapshot.loc[0, "geracao_referencia_mw"] == pytest.approx(35.0)
    assert report["scientific_status"] == "exploratory_not_approved"
    assert report["eligibility"]["reference_above_available_capacity"] == 1
    assert report["eligibility"]["rows_eligible"] == 1


def _training_panel(hours: int = 180) -> pd.DataFrame:
    rng = np.random.default_rng(91)
    timestamps = pd.date_range("2024-01-01", periods=hours, freq="h", tz="UTC")
    rows = []
    for hour, timestamp in enumerate(timestamps):
        regime = np.sin(2 * np.pi * hour / 24)
        for plant_index, plant in enumerate(("a", "b")):
            wind = 8.0 + 1.8 * regime + 0.2 * plant_index
            density = 1.20 - 0.018 * regime + rng.normal(0, 0.01)
            temperature = 292.0
            pressure = density * 287.05 * temperature
            capacity = 100.0 + 10 * plant_index
            availability = 0.95
            baseline = physical_power_mw(
                pd.Series([wind]), pd.Series([capacity]),
                pd.Series([availability]), TrainingConfig().physical_curve,
            )[0]
            residual_cf = 0.025 + 0.18 * (density - 1.20) + rng.normal(0, 0.004)
            rows.append({
                "usina_id": plant,
                "timestamp_utc": timestamp,
                "u100": wind,
                "v100": 0.35,
                "temperature_2m": temperature,
                "surface_pressure": pressure,
                "capacidade_instalada_mw": capacity,
                "disponibilidade": availability,
                "era5_distance_km": 3.0 + plant_index,
                "geracao_referencia_mw": baseline + residual_cf * capacity,
            })
    return pd.DataFrame(rows)


def test_hackathon_report_uses_paired_future_rows_and_stays_exploratory():
    config = TrainingConfig(
        target="geracao_referencia_mw",
        allow_multiple_plants=True,
        features=FeatureConfig(require_complete_history=False),
        lightgbm=LightGBMConfig(n_estimators=12, min_child_samples=5),
    )
    spec = CausalEstimandSpec(
        n_crossfit_splits=2,
        minimum_oof_rows=20,
        inference_cluster_hours=12,
        status="infrastructure_test",
    )
    panel = _training_panel()
    late_start = panel["timestamp_utc"].max() - pd.Timedelta(hours=9)
    panel.loc[
        panel["timestamp_utc"].ge(late_start) & panel["usina_id"].eq("b"),
        "usina_id",
    ] = "new-late-plant"
    report, predictions, model = build_hackathon_insights(
        panel, config, spec, outer_splits=2,
        nuisance_config=NuisanceConfig(n_estimators=12, min_child_samples=5),
    )

    assert report["schema_version"] == SCHEMA_VERSION
    assert report["scientifically_approved"] is False
    assert report["operational_model"] == "physical_curve"
    assert report["comparison"]["paired"] is True
    assert report["comparison"]["rows"] == len(predictions)
    assert report["coverage"]["model_rows"] == len(predictions)
    assert report["coverage"]["model_rows"] + report["coverage"]["fallback_rows"] == report["coverage"]["evaluation_rows"]
    assert report["coverage"]["fallback_unknown_plant_rows"] == 10
    assert set(report["overall_metrics"]) == {"physical", "lightgbm", "dml"}
    assert predictions[["baseline_mw", "lightgbm_mw", "dml_mw"]].notna().all().all()
    assert model.spec.estimand_id == spec.estimand_id


def test_insights_reader_rejects_approval_and_exposes_missing_state(tmp_path):
    report_path = tmp_path / "insights.json"
    service = ExperimentalInsightsService(report_path)
    assert service.read()["status"] == "not_materialized"

    report_path.write_text(json.dumps({
        "schema_version": SCHEMA_VERSION,
        "scientifically_approved": True,
    }), encoding="utf-8")
    with pytest.raises(ValueError, match="aprovação científica"):
        service.read()
