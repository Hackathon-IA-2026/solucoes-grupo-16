from fastapi.testclient import TestClient

import pytest
from app.main import create_app


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path)) as client:
        yield client


def payload(timestamp="2026-08-01T14:00:00Z"):
    return {"usina_id": "ONS_123", "capacidade_instalada_mw": 100, "disponibilidade": 0.95,
            "registros": [{"timestamp_utc": timestamp, "u100": 7.2, "v100": -3.1,
                           "temperature_2m": 298.15, "surface_pressure": 100900}]}


def test_timestamp_without_timezone_is_rejected(client):
    response = client.post("/estimar-geracao", json=payload("2026-08-01T14:00:00"))
    assert response.status_code == 422


def test_endpoint_contract_uses_explicit_physical_fallback_without_artifact(client):
    response = client.post("/estimar-geracao", json=payload())
    assert response.status_code == 200
    body = response.json()
    assert body["model_scope"] == "physical_fallback"
    prediction = body["predicoes"][0]
    assert {"baseline_mw", "correcao_ml_mw", "geracao_estimada_mw", "limite_inferior_mw", "limite_superior_mw", "confianca", "warnings"} <= set(prediction)
    assert prediction["limite_inferior_mw"] is None
    assert prediction["limite_superior_mw"] is None


@pytest.mark.parametrize("field,value", [("u100", 51), ("temperature_2m", 20), ("surface_pressure", 1000)])
def test_invalid_climate(client, field, value):
    body = payload()
    body["registros"][0][field] = value
    assert client.post("/estimar-geracao", json=body).status_code == 422


def test_duplicate_timestamp_batch_limit_and_utc(client):
    body = payload("2026-08-01T14:00:00-03:00")
    response = client.post("/estimar-geracao", json=body)
    assert response.json()["predicoes"][0]["timestamp_utc"] == "2026-08-01T17:00:00Z"
    body["registros"] *= 2
    assert client.post("/estimar-geracao", json=body).status_code == 422
    body["registros"] *= 251
    assert client.post("/estimar-geracao", json=body).status_code == 422


def test_load_once_at_startup(tmp_path, monkeypatch):
    from app.predictor import Predictor
    original = Predictor.from_artifacts
    calls = []
    def load(path):
        calls.append(path)
        return original(path)
    monkeypatch.setattr(Predictor, "from_artifacts", load)
    with TestClient(create_app(tmp_path)) as client:
        client.get("/health")
        client.post("/estimar-geracao", json=payload())
        client.post("/estimar-geracao", json=payload())
    assert calls == [tmp_path]


@pytest.mark.parametrize("hybrid", [False, True])
def test_per_record_availability_and_calibrated_bounds(tmp_path, hybrid):
    import numpy as np
    from app.predictor import Predictor

    class Model:
        def predict(self, features, **kwargs):
            assert features.disponibilidade.tolist() == [0.2, 0.9, 0.0, 0.5]
            return np.full(len(features), 0.1)

    predictor = Predictor(
        tmp_path, Model() if hybrid else None,
        {"model_version": "test", "model_scope": "global", "approved": hybrid,
         "training_usina_ids": ["ONS_123"],
         "input_domain": {"disponibilidade": {"min": 0, "max": 1}}},
        {"global": {"p05": -0.1, "p95": 0.2}, "wind_bands": {}},
    )
    body = payload()
    body["disponibilidade"] = 0.5
    base = body["registros"][0]
    body["registros"] = [
        {**base, "timestamp_utc": f"2026-08-01T{14 + i}:00:00Z",
         "u100": 12, "v100": 0, **({"disponibilidade": value} if value is not None else {})}
        for i, value in enumerate([0.2, 0.9, 0.0, None])
    ]
    with TestClient(create_app(tmp_path)) as client:
        client.app.state.predictor = predictor
        response = client.post("/estimar-geracao", json=body)
    assert response.status_code == 200
    predictions = response.json()["predicoes"]
    assert [p["geracao_estimada_mw"] for p in predictions] == [20, 90, 0, 50]
    assert [p["correcao_ml_mw"] for p in predictions] == [0, 0, 0, 0]
    assert [p["limite_inferior_mw"] for p in predictions] == ([10, 80, 0, 40] if hybrid else [None] * 4)
    assert [p["limite_superior_mw"] for p in predictions] == ([20, 90, 0, 50] if hybrid else [None] * 4)


def test_historical_routes_without_snapshot(tmp_path, monkeypatch):
    monkeypatch.setenv("CLIMAGRID_TRAINING_SNAPSHOT", str(tmp_path / "missing.parquet"))
    monkeypatch.setenv("CLIMAGRID_PLANT_CATALOG", str(tmp_path / "catalog.parquet"))
    monkeypatch.setenv("CLIMAGRID_DATA_ROOT", str(tmp_path / "data"))
    with TestClient(create_app(tmp_path)) as client:
        response = client.get("/capabilities")
        assert response.status_code == 200
        assert response.json()["features"]["historical_estimates"] is False
        response = client.post("/estimar-historico", json={
            "start_at": "2026-09-01T00:00:00Z", "end_at": "2026-09-01T01:00:00Z",
        })
        assert response.status_code == 409
        assert "snapshot" in response.json()["detail"]
