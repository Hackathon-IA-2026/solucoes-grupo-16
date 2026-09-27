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


def test_new_model_uses_only_records_with_six_hour_context(tmp_path):
    import numpy as np
    from app.predictor import Predictor

    class Model:
        def predict(self, features, **kwargs):
            assert len(features) == 1
            assert features.temporal_context_complete.tolist() == [1]
            return np.array([0.05])

    predictor = Predictor(tmp_path, Model(), {
        "model_version": "causal-v1", "model_scope": "global", "approved": True,
        "required_history_hours": 6, "most_required": False,
        "training_usina_ids": ["ONS_123"],
        "input_domain": {"wind_speed_100m": {"min": 0, "max": 20}},
    }, {"global": {"p05": -0.1, "p95": 0.1}, "wind_bands": {}})
    body = payload()
    base = body["registros"][0]
    body["registros"] = [
        {**base, "timestamp_utc": f"2026-08-01T{hour:02d}:00:00Z"}
        for hour in range(8, 15)
    ]
    with TestClient(create_app(tmp_path)) as client:
        client.app.state.predictor = predictor
        response = client.post("/estimar-geracao", json=body)
    assert response.status_code == 200
    result = response.json()
    assert result["model_scope"] == "mixed"
    assert [item["confianca"] for item in result["predicoes"]] == ["baixa"] * 6 + ["media"]
    assert all(item["limite_inferior_mw"] is None for item in result["predicoes"][:6])
    assert result["predicoes"][-1]["limite_inferior_mw"] is not None


def test_historical_routes_without_snapshot(tmp_path, monkeypatch):
    monkeypatch.setattr("app.historical.on_demand_configured", lambda: False)
    monkeypatch.setenv("CLIMAGRID_HISTORICAL_SNAPSHOT", str(tmp_path / "missing.parquet"))
    monkeypatch.setenv("CLIMAGRID_PLANT_CATALOG", str(tmp_path / "catalog.parquet"))
    monkeypatch.setenv("CLIMAGRID_DATA_ROOT", str(tmp_path / "data"))
    with TestClient(create_app(tmp_path)) as client:
        response = client.get("/capabilities")
        assert response.status_code == 200
        assert response.json()["features"]["historical_replay"] is False
        response = client.post("/replay-historico", json={
            "timestamp": "2026-09-01T00:00:00Z",
        })
        assert response.status_code == 409
        assert "CDSAPI_KEY" in response.json()["detail"]


def test_experimental_insights_endpoint_is_read_only_and_explicit(tmp_path, monkeypatch):
    report_path = tmp_path / "insights.json"
    report_path.write_text(
        '{"schema_version":"climagrid-dml-hackathon-insights-v1",'
        '"status":"exploratory_evidence","scientifically_approved":false,'
        '"message":"Somente para pitch."}',
        encoding="utf-8",
    )
    monkeypatch.setenv("CLIMAGRID_DML_INSIGHTS_PATH", str(report_path))
    monkeypatch.setenv("CLIMAGRID_INDEPENDENT_HOLDOUT_PATH", str(tmp_path / "missing.json"))
    with TestClient(create_app(tmp_path)) as client:
        capabilities = client.get("/capabilities").json()
        response = client.get("/insights-experimentais")

    assert capabilities["features"]["experimental_insights"] is True
    assert response.status_code == 200
    assert response.json()["available"] is True
    assert response.json()["scientifically_approved"] is False
    assert response.json()["independent_holdout"] is None


def test_experimental_insights_includes_independent_holdout(tmp_path, monkeypatch):
    report_path = tmp_path / "insights.json"
    report_path.write_text(
        '{"schema_version":"climagrid-dml-hackathon-insights-v1",'
        '"status":"exploratory_evidence","scientifically_approved":false,'
        '"message":"Somente para pitch."}',
        encoding="utf-8",
    )
    holdout_path = tmp_path / "holdout.json"
    holdout_path.write_text(
        '{"schema_version":"climagrid-independent-month-holdout-v1",'
        '"status":"exploratory_independent_holdout_consumed",'
        '"scientifically_approved":false,"metrics":{}}',
        encoding="utf-8",
    )
    monkeypatch.setenv("CLIMAGRID_DML_INSIGHTS_PATH", str(report_path))
    monkeypatch.setenv("CLIMAGRID_INDEPENDENT_HOLDOUT_PATH", str(holdout_path))

    with TestClient(create_app(tmp_path)) as client:
        body = client.get("/insights-experimentais").json()

    assert body["independent_holdout"]["status"] == "exploratory_independent_holdout_consumed"
    assert body["independent_holdout"]["scientifically_approved"] is False
