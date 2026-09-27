import json
import subprocess
import sys

import lightgbm as lgb
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.predictor import Predictor
from app.schemas import EstimationRequest
from training.build_dataset import prepare_hourly_dataset
from training.config import LightGBMConfig, PhysicalCurveConfig, TrainingConfig, load_config
from training.evaluate import empirical_interval_table, evaluate_artifact, interval_bounds, regression_metrics
from training.features import FEATURE_COLUMNS, feature_matrix
from training.physical_curve import physical_power_mw
from training.train import train


def request_body(frame, history_hours=0):
    row = frame.iloc[10]
    rows = frame.iloc[10 - history_hours:11]
    return {"usina_id": str(row.usina_id), "capacidade_instalada_mw": float(row.capacidade_instalada_mw),
            "disponibilidade": float(row.disponibilidade), "registros": [{
                "timestamp_utc": item.timestamp_utc.isoformat(), "u100": float(item.u100), "v100": float(item.v100),
                "temperature_2m": float(item.temperature_2m), "surface_pressure": float(item.surface_pressure)}
                for item in rows.itertuples(index=False)]}


@pytest.mark.parametrize("improve", [True, False])
def test_real_lightgbm_training_artifacts_evaluation_and_api(synthetic_frame, tmp_path, monkeypatch, improve):
    config = TrainingConfig(target="geracao_referencia_mw")
    if not improve:
        synthetic_frame[config.target] = physical_power_mw(synthetic_frame.u100, 100, 0.95)
    # A test-only extreme must not expand the training domain.
    synthetic_frame.loc[719, "u100"] = 40.0
    synthetic_frame.loc[719, config.target] = 0.0
    dataset, _ = prepare_hourly_dataset(synthetic_frame, config)
    original_fit = lgb.LGBMRegressor.fit
    calls = []
    def fit(model, X, y, **kwargs):
        calls.append((X.index.tolist(), kwargs["eval_set"][0][0].index.tolist()))
        assert len(kwargs["eval_set"]) == 1
        return original_fit(model, X, y, **kwargs)
    monkeypatch.setattr(lgb.LGBMRegressor, "fit", fit)
    metadata = train(dataset, config, tmp_path)
    assert calls == [(list(range(504)), list(range(504, 612)))]
    assert metadata["approved"] is improve
    assert metadata["wind_speed_domain_ms"]["max"] == 18.0
    assert metadata["feature_order"] == FEATURE_COLUMNS
    assert metadata["training_config"]["target"] == config.target
    assert {"model.txt", "metadata.json", "residual_quantiles.json", "validation_report.json"} <= {p.name for p in tmp_path.iterdir()}
    report = evaluate_artifact(dataset, tmp_path)
    assert report["hybrid_test"]["overall"]["mae_mw"] == pytest.approx(metadata["metrics"]["hybrid_test"]["overall"]["mae_mw"])
    with TestClient(create_app(tmp_path)) as client:
        body = request_body(dataset, history_hours=6)
        result = client.post("/estimar-geracao", json=body)
        assert result.status_code == 200
        assert result.json()["model_scope"] == ("mixed" if improve else "physical_fallback")
        prediction = result.json()["predicoes"][-1]
        assert 0 <= prediction["geracao_estimada_mw"] <= 95
        assert (prediction["limite_inferior_mw"] is not None) is improve
        body["registros"][0]["u100"] = 40
        fallback = client.post("/estimar-geracao", json=body).json()
        assert fallback["model_scope"] == "physical_fallback"
        assert fallback["predicoes"][0]["geracao_estimada_mw"] == 0
        body["usina_id"] = "unseen"
        assert client.post("/estimar-geracao", json=body).json()["model_scope"] == "physical_fallback"
    changed = dataset.copy()
    changed.loc[700, config.target] += 1
    with pytest.raises(ValueError, match="Snapshot"):
        evaluate_artifact(changed, tmp_path)
    # Extra future rows cannot move the recorded test window.
    future = dataset.iloc[:24].copy()
    future["timestamp_utc"] += pd.Timedelta(days=40)
    assert evaluate_artifact(pd.concat([dataset, future]), tmp_path)["split_periods"] == metadata["split_periods"]


def test_no_target_blocks_training(synthetic_frame, tmp_path):
    with pytest.raises(ValueError, match="Treino real bloqueado"):
        train(synthetic_frame, TrainingConfig(), tmp_path)
    assert not list(tmp_path.iterdir())


def test_training_and_api_feature_values_match_without_target_leakage(synthetic_frame):
    body = EstimationRequest.model_validate(request_body(synthetic_frame))
    raw = pd.DataFrame([r.model_dump() for r in body.registros]).assign(
        capacidade_instalada_mw=body.capacidade_instalada_mw, disponibilidade=body.disponibilidade)
    expected = feature_matrix(synthetic_frame.iloc[[10]]).reset_index(drop=True)
    pd.testing.assert_frame_equal(expected, feature_matrix(raw), check_dtype=False)
    contaminated = synthetic_frame.assign(geracao_referencia_mw=999, geracao_verificada_mw=999,
                                         motivo_restricao="REL", teve_restricao=True)
    pd.testing.assert_frame_equal(feature_matrix(synthetic_frame), feature_matrix(contaminated))


def test_signed_quantiles_sparse_fallback_scaling_and_cut_out():
    validation = pd.DataFrame({"target_mw": [10, 20, 30, 40], "hybrid_mw": [20] * 4,
                               "capacidade_instalada_mw": [100] * 4, "wind_speed_100m": [8] * 4})
    table = empirical_interval_table(validation, minimum_samples=5)
    assert table["global"]["p05"] == pytest.approx(-0.085)
    assert table["global"]["p95"] == pytest.approx(0.185)
    assert table["wind_bands"]["6-9"]["source"] == "global_fallback"
    low, high = interval_bounds(np.array([40, 0]), np.array([8, 25]), 200, 1, table, PhysicalCurveConfig())
    assert low.tolist() == pytest.approx([23, 0])
    assert high.tolist() == pytest.approx([77, 0])


def test_metrics_zero_generation_has_no_infinite_wape():
    result = regression_metrics([0, 0], [1, 2], [10, 10])
    assert result["wape"] is None
    assert result["nmae_cf"] == pytest.approx(0.15)


def test_corrupt_artifact_falls_back(tmp_path):
    for name in ("metadata.json", "residual_quantiles.json", "model.txt"):
        (tmp_path / name).write_text("invalid", encoding="utf-8")
    predictor = Predictor.from_artifacts(tmp_path)
    assert not predictor.approved
    assert predictor.health()["model_scope"] == "physical_fallback"


def test_configurable_curve_roundtrip(synthetic_frame, tmp_path):
    curve = PhysicalCurveConfig(cut_in_ms=2, rated_ms=10, cut_out_ms=24)
    config = TrainingConfig(target="geracao_referencia_mw", physical_curve=curve)
    synthetic_frame[config.target] = physical_power_mw(synthetic_frame.u100, 100, 0.95, curve)
    metadata = train(synthetic_frame, config, tmp_path)
    report = evaluate_artifact(synthetic_frame, tmp_path)
    assert report["baseline_test"]["overall"]["mae_mw"] == 0
    assert metadata["physical_curve"]["rated_ms"] == 10


def test_lightgbm_config_roundtrip_and_training(synthetic_frame, tmp_path):
    config_file = tmp_path / "experiment.json"
    config_file.write_text(json.dumps({"target": "geracao_referencia_mw",
        "lightgbm": {"min_child_samples": 50}}), encoding="utf-8")
    config = load_config(config_file)
    assert config.lightgbm == LightGBMConfig(min_child_samples=50)
    metadata = train(synthetic_frame, config, tmp_path / "artifact")
    assert metadata["lightgbm_params"]["min_child_samples"] == 50
    assert metadata["training_config"]["lightgbm"]["min_child_samples"] == 50
    assert TrainingConfig.from_dict(metadata["training_config"]).lightgbm == config.lightgbm
    with pytest.raises(ValueError, match="LightGBM"):
        LightGBMConfig(min_child_samples=0)


def test_cli_rejects_verified_generation_as_training_target(synthetic_frame, tmp_path):
    source = tmp_path / "source.csv"
    synthetic_frame.rename(columns={"geracao_referencia_mw": "campo_alvo_validado"}).to_csv(source, index=False)
    config_file = tmp_path / "config.json"
    config_file.write_text(json.dumps({"target": "geracao_verificada_mw",
        "columns": {"geracao_verificada_mw": "campo_alvo_validado"}}), encoding="utf-8")
    artifact = tmp_path / "artifact"
    processed = tmp_path / "hourly.csv"
    result = subprocess.run([sys.executable, "-m", "training.train", "--input", str(source),
        "--config", str(config_file), "--artifacts", str(artifact), "--processed", str(processed)],
        capture_output=True, text=True, timeout=90)
    assert result.returncode != 0
    assert not processed.exists()
    assert not artifact.exists()


def test_api_rejects_infinite_capacity(synthetic_frame):
    body = request_body(synthetic_frame)
    body["capacidade_instalada_mw"] = float("inf")
    with pytest.raises(ValueError):
        EstimationRequest.model_validate(body)
