from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from fastapi.testclient import TestClient

from app.historical import HistoricalDataUnavailable, HistoricalScenarioService
from app.main import create_app
from app.predictor import Predictor
from app.schemas import HistoricalReplayRequest


def _service(tmp_path: Path) -> HistoricalScenarioService:
    snapshot = tmp_path / "observations.parquet"
    catalog = tmp_path / "catalog.parquet"
    mapping = tmp_path / "mapping.parquet"
    data_root = tmp_path / "data"
    (data_root / "raw" / "ons").mkdir(parents=True)
    (data_root / "raw" / "ons" / "ons.parquet").write_bytes(b"snapshot")

    pd.DataFrame(
        {
            "usina_id": ["ONS_1", "ONS_1", "ONS_2"],
            "timestamp_utc": [
                "2024-01-01T03:00:00Z",
                "2024-01-01T04:00:00Z",
                "2024-01-01T03:00:00Z",
            ],
            "capacidade_instalada_mw": [100.0, 100.0, 50.0],
            "geracao_verificada_mw": [72.5, 65.0, 20.0],
            "u100": [7.0, 8.0, 3.0],
            "v100": [1.0, 1.0, 4.0],
        }
    ).to_parquet(snapshot, index=False)
    pd.DataFrame(
        {
            "usina_id": ["ONS_1", "ONS_2"],
            "capacidade_instalada_mw": [100.0, 50.0],
            "nom_usina_ons": ["Parque Teste", "Parque Dois"],
            "uf_ons": ["RN", "BA"],
            "latitude": [-5.0, -10.0],
            "longitude": [-36.0, -42.0],
            "match_status": ["matched", "matched"],
        }
    ).to_parquet(catalog, index=False)
    pd.DataFrame(
        {
            "usina_id": ["ONS_1", "ONS_1", "ONS_2"],
            "location_id": ["member-1", "member-1", "member-2"],
            "bus_number": [101, 102, 201],
            "pwf_plant_name": ["EOL UM A", "EOL UM B", "EOL DOIS"],
            "allocation_capacity_mw": [60.0, 40.0, 50.0],
            "relationship_start": ["2023-01-01", "2023-01-01", "2023-01-01"],
            "relationship_end": [None, None, None],
            "group_member_count": [1, 1, 1],
            "mapped_member_count": [1, 1, 1],
        }
    ).to_parquet(mapping, index=False)

    predictor = Predictor(
        artifact_dir=tmp_path,
        model=None,
        metadata={
            "model_version": "physical-curve-v1",
            "model_scope": "physical_fallback",
            "approved": False,
        },
        intervals={},
    )
    return HistoricalScenarioService(
        predictor=predictor,
        snapshot_path=snapshot,
        catalog_path=catalog,
        data_root=data_root,
        mapping_path=mapping,
    )


def test_historical_replay_returns_observed_generation_for_exact_instant(tmp_path: Path):
    service = _service(tmp_path)

    capabilities = service.capabilities()
    assert capabilities["features"]["historical_replay"] is True
    assert capabilities["features"]["historical_estimates"] is False
    assert capabilities["data"]["historical_instant_count"] == 2

    result = service.replay(
        HistoricalReplayRequest(
            subsystem="NE",
            timestamp=datetime(2024, 1, 1, 3, tzinfo=timezone.utc),
            resolution_minutes=60,
        )
    )

    assert result.timestamp == datetime(2024, 1, 1, 3, tzinfo=timezone.utc)
    assert result.generation_source == "ONS_GERACAO_USINA_2_HO"
    assert result.weather_source == "ERA5"
    assert len(result.observations) == 2
    first = next(item for item in result.observations if item.usina_id == "ONS_1")
    assert first.name == "Parque Teste"
    assert first.state == "RN"
    assert first.observed_generation_mw == 72.5
    assert first.capacity_factor_percent == 72.5
    assert first.wind_speed_mps == 7.071068
    assert [item.bus_number for item in first.suggested_bus_allocations] == [101, 102]
    assert sum(item.allocated_generation_mw for item in first.suggested_bus_allocations) == 72.5
    assert first.mapping_coverage_percent == 100


def test_historical_replay_rejects_an_unavailable_instant(tmp_path: Path):
    service = _service(tmp_path)
    try:
        service.replay(
            HistoricalReplayRequest(
                timestamp=datetime(2024, 2, 1, tzinfo=timezone.utc)
            )
        )
    except HistoricalDataUnavailable as error:
        assert "não contém observações" in str(error)
        assert "2024-01-01" in str(error)
    else:
        raise AssertionError("O replay deveria rejeitar uma hora sem observações.")


def test_historical_replay_api_contract(tmp_path: Path, monkeypatch):
    service = _service(tmp_path)
    monkeypatch.setenv("CLIMAGRID_HISTORICAL_SNAPSHOT", str(service.snapshot_path))
    monkeypatch.setenv("CLIMAGRID_PLANT_CATALOG", str(service.catalog_path))
    monkeypatch.setenv("CLIMAGRID_DATA_ROOT", str(service.data_root))
    monkeypatch.setenv("CLIMAGRID_PWF_MAPPING", str(service.mapping_path))

    with TestClient(create_app(tmp_path)) as client:
        availability = client.get("/historico/disponibilidade")
        assert availability.status_code == 200
        assert availability.json()["instant_count"] == 2

        response = client.post(
            "/replay-historico",
            json={"timestamp": "2024-01-01T00:00:00-03:00"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["timestamp"] == "2024-01-01T03:00:00Z"
        assert body["observations"][0]["observed_generation_mw"] >= 0
        assert "estimated_generation_mw" not in body["observations"][0]
