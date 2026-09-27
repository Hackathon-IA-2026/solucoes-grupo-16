from datetime import datetime, timezone
from pathlib import Path
from threading import Event

import pandas as pd
from fastapi.testclient import TestClient

from app.historical import HistoricalDataUnavailable, HistoricalScenarioService
from app.historical_ingestion import replay_partition
from app.historical_ingestion import validate_replay_date
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


def test_availability_checks_project_only_the_timestamp_column(tmp_path: Path, monkeypatch):
    service = _service(tmp_path)
    original_read_parquet = pd.read_parquet
    projected_columns: list[list[str] | None] = []

    def tracked_read_parquet(path, *args, **kwargs):
        if Path(path) == service.snapshot_path:
            projected_columns.append(kwargs.get("columns"))
        return original_read_parquet(path, *args, **kwargs)

    monkeypatch.setattr(pd, "read_parquet", tracked_read_parquet)

    service.availability()
    service._find_snapshot(pd.Timestamp("2024-01-01T03:00:00Z"))

    assert projected_columns == [["timestamp_utc"], ["timestamp_utc"]]


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


def test_replay_api_reports_background_preparation(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(
        HistoricalScenarioService, "request_replay",
        lambda self, request: {"status": "preparing", "message": "Coleta em andamento."},
    )
    with TestClient(create_app(tmp_path)) as client:
        response = client.post("/replay-historico", json={"timestamp": "2024-08-15T12:00:00Z"})
    assert response.status_code == 202
    assert response.json()["status"] == "preparing"


def test_replay_partition_uses_local_ons_month_and_utc_era5_month(tmp_path: Path):
    timestamp = pd.Timestamp("2024-09-01T01:00:00Z")
    path = replay_partition(tmp_path, timestamp)
    assert "year=2024" in str(path)
    assert "month=08" in str(path)
    assert path.name == "observations_utc_2024-09.parquet"


def test_on_demand_rejects_future_and_pre_ons_dates():
    import pytest

    with pytest.raises(ValueError, match="janeiro de 2022"):
        validate_replay_date(pd.Timestamp("2021-12-31T12:00:00Z"))
    with pytest.raises(ValueError, match="hora histórica"):
        validate_replay_date(pd.Timestamp.now(tz="UTC") + pd.Timedelta(days=1))


def test_missing_hour_starts_collection_then_replays_cached_partition(tmp_path: Path, monkeypatch):
    service = _service(tmp_path)
    selected = pd.Timestamp("2024-08-15T12:00:00Z")
    monkeypatch.setattr("app.historical.on_demand_configured", lambda: True)
    release = Event()

    def prepare(root: Path, timestamp: pd.Timestamp) -> Path:
        assert release.wait(timeout=5)
        path = replay_partition(root, timestamp)
        path.parent.mkdir(parents=True, exist_ok=True)
        frame = pd.read_parquet(service.snapshot_path).iloc[:1].copy()
        frame["timestamp_utc"] = selected
        frame.to_parquet(path, index=False)
        return path

    monkeypatch.setattr("app.historical.prepare_replay_partition", prepare)
    request = HistoricalReplayRequest(timestamp=selected.to_pydatetime())
    first = service.request_replay(request)
    assert isinstance(first, dict) and first["status"] == "preparing"
    release.set()
    future = next(iter(service._jobs.values()))
    future.result(timeout=5)
    result = service.request_replay(request)
    assert result.timestamp == selected.to_pydatetime()
    assert len(result.observations) == 1
