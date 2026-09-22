from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def payload(timestamp="2026-08-01T14:00:00Z"):
    return {"usina_id": "ONS_123", "capacidade_instalada_mw": 100, "disponibilidade": 0.95,
            "registros": [{"timestamp_utc": timestamp, "u100": 7.2, "v100": -3.1,
                           "temperature_2m": 298.15, "surface_pressure": 100900}]}


def test_timestamp_without_timezone_is_rejected():
    response = client.post("/estimar-geracao", json=payload("2026-08-01T14:00:00"))
    assert response.status_code == 422


def test_endpoint_contract_uses_explicit_physical_fallback_without_artifact():
    response = client.post("/estimar-geracao", json=payload())
    assert response.status_code == 200
    body = response.json()
    assert body["model_scope"] == "physical_fallback"
    prediction = body["predicoes"][0]
    assert {"baseline_mw", "correcao_ml_mw", "geracao_estimada_mw", "limite_inferior_mw", "limite_superior_mw", "confianca", "warnings"} <= set(prediction)
