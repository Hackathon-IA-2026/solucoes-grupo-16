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
