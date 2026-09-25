from pathlib import Path

import pandas as pd
from fastapi.testclient import TestClient

from app.climate_file import ClimateFileError, ClimateFileService, parse_climate_csv
from app.main import create_app


CSV = (
    "timestamp_utc,usina_id,u100,v100,disponibilidade\n"
    "2024-01-01T03:00:00Z,ONS_1,8,0,0.5\n"
    "2024-01-01T04:00:00Z,ONS_1,12,0,1\n"
)


def _catalog(tmp_path: Path) -> Path:
    path = tmp_path / "catalog.parquet"
    pd.DataFrame({
        "usina_id": ["ONS_1"], "id_ons": ["ONS_1"],
        "location_id": ["CEG_1"], "capacidade_instalada_mw": [100.0],
        "match_status": ["matched"], "nom_usina_ons": ["Parque Teste"],
        "uf_ons": ["RN"],
    }).to_parquet(path, index=False)
    return path


def test_climate_file_estimates_only_selected_hour_and_tracks_provenance(tmp_path, monkeypatch):
    monkeypatch.setenv("CLIMAGRID_PLANT_CATALOG", str(_catalog(tmp_path)))
    monkeypatch.setenv("CLIMAGRID_PWF_MAPPING", str(tmp_path / "missing.parquet"))
    with TestClient(create_app(tmp_path)) as client:
        inspection = client.post("/cenario-climatico/inspecionar", json={"csv_text": CSV})
        assert inspection.status_code == 200
        assert inspection.json()["timestamps"] == [
            "2024-01-01T03:00:00+00:00", "2024-01-01T04:00:00+00:00"
        ]
        result = client.post("/cenario-climatico/estimar", json={
            "csv_text": CSV, "timestamp_utc": "2024-01-01T03:00:00Z",
        })
        assert result.status_code == 200
        body = result.json()
        assert body["generation_source"] == "PHYSICAL_CURVE"
        assert body["weather_source"] == "USER"
        assert body["data_version"].endswith(inspection.json()["sha256"])
        assert body["provenance"]["input_schema_version"] == "normalized-ons-hourly-v1"
        assert body["provenance"]["input_sha256"] == inspection.json()["sha256"]
        assert body["provenance"]["catalog_sha256"]
        assert body["provenance"]["mapping_sha256"] is None
        assert body["provenance"]["estimator_version"] == "physical-curve-v1"
        assert body["provenance"]["physical_curve"] == {
            "cut_in_ms": 3.0, "rated_ms": 12.0, "cut_out_ms": 25.0,
        }
        assert len(body["observations"]) == 1
        observation = body["observations"][0]
        assert observation["observed_generation_mw"] is None
        assert 0 < observation["estimated_generation_mw"] <= 50
        assert observation["availability"] == 0.5
        assert observation["warnings"] == ["mapeamento_pwf_ausente"]


def test_climate_file_rejects_duplicate_and_invalid_availability():
    try:
        parse_climate_csv(CSV + "2024-01-01T03:00:00Z,ONS_1,8,0,0.5\n")
    except ClimateFileError as error:
        assert "duplicadas" in str(error)
    else:
        raise AssertionError("Duplicata deveria ser rejeitada")

    try:
        parse_climate_csv(CSV.replace(",0.5\n", ",1.2\n"))
    except ClimateFileError as error:
        assert "disponibilidade" in str(error)
    else:
        raise AssertionError("Disponibilidade acima de 1 deveria ser rejeitada")


def test_climate_file_rejects_unmatched_catalog(tmp_path, monkeypatch):
    catalog = _catalog(tmp_path)
    frame = pd.read_parquet(catalog)
    frame.loc[0, "match_status"] = "review_required"
    frame.to_parquet(catalog, index=False)
    monkeypatch.setenv("CLIMAGRID_PLANT_CATALOG", str(catalog))
    with TestClient(create_app(tmp_path)) as client:
        response = client.post("/cenario-climatico/estimar", json={
            "csv_text": CSV, "timestamp_utc": "2024-01-01T03:00:00Z",
        })
    assert response.status_code == 422
    assert "sem cadastro totalmente conciliado" in response.json()["detail"]


def test_climate_file_ignores_inactive_unmatched_catalog_member(tmp_path, monkeypatch):
    catalog = _catalog(tmp_path)
    frame = pd.read_parquet(catalog)
    frame["relationship_start"] = ["2023-01-01"]
    frame["relationship_end"] = [None]
    inactive = frame.iloc[0].copy()
    inactive["location_id"] = "CEG_OLD"
    inactive["match_status"] = "review_required"
    inactive["relationship_start"] = "2022-01-01"
    inactive["relationship_end"] = "2022-12-31"
    pd.concat([frame, inactive.to_frame().T], ignore_index=True).to_parquet(
        catalog, index=False
    )
    monkeypatch.setenv("CLIMAGRID_PLANT_CATALOG", str(catalog))
    monkeypatch.setenv("CLIMAGRID_PWF_MAPPING", str(tmp_path / "missing.parquet"))

    with TestClient(create_app(tmp_path)) as client:
        response = client.post("/cenario-climatico/estimar", json={
            "csv_text": CSV,
            "timestamp_utc": "2024-01-01T03:00:00Z",
        })

    assert response.status_code == 200
    assert response.json()["observations"][0]["usina_id"] == "ONS_1"


def test_era5_scenario_builds_normalized_csv_and_uses_physical_curve(tmp_path, monkeypatch):
    data_root = tmp_path / "data"
    weather_path = (data_root / "processed" / "era5" / "year=2024" / "month=01"
                    / "weather_hourly.parquet")
    weather_path.parent.mkdir(parents=True)
    pd.DataFrame({
        "timestamp_utc": ["2024-01-01T03:00:00Z", "2024-01-01T03:00:00Z"],
        "usina_id": ["ONS_1", "ONS_SEM_CADASTRO"],
        "u100": [8.0, 7.0],
        "v100": [0.0, 1.0],
        "temperature_2m": [298.0, 297.0],
        "surface_pressure": [101325.0, 101000.0],
    }).to_parquet(weather_path, index=False)
    monkeypatch.setenv("CLIMAGRID_DATA_ROOT", str(data_root))
    monkeypatch.setenv("CLIMAGRID_PLANT_CATALOG", str(_catalog(tmp_path)))
    monkeypatch.setenv("CLIMAGRID_PWF_MAPPING", str(tmp_path / "missing.parquet"))

    with TestClient(create_app(tmp_path)) as client:
        response = client.post("/cenario-climatico/era5/estimar", json={
            "timestamp_utc": "2024-01-01T03:00:00Z",
            "availability": 0.9,
        })

    assert response.status_code == 200
    body = response.json()
    assert body["weather_source"] == "ERA5"
    assert body["generation_source"] == "PHYSICAL_CURVE"
    assert body["data_version"].startswith("era5-generated-csv-sha256-")
    assert body["provenance"]["availability_source"] == "USER_GLOBAL_ASSUMPTION"
    assert body["provenance"]["availability_value"] == 0.9
    assert body["provenance"]["excluded_usina_ids"] == ["ONS_SEM_CADASTRO"]
    assert body["provenance"]["catalog_coverage_percent"] == 50
    assert body["provenance"]["weather_data_version"].startswith("era5-weather-sha256-")
    assert "2024-01-01T03:00:00Z,ONS_1,8.0,0.0,0.9" in body["normalized_csv"]
    assert body["observations"][0]["availability"] == 0.9
    assert body["observations"][0]["weather_source"] == "ERA5"
    assert "ha_conjuntos_era5_excluidos_por_cadastro_incompleto" in body["warnings"]


def test_era5_scenario_reports_background_preparation(tmp_path, monkeypatch):
    monkeypatch.setattr(
        ClimateFileService,
        "estimate_from_era5",
        lambda self, timestamp, availability: {
            "status": "preparing",
            "message": "Coleta ERA5 em andamento.",
        },
    )
    with TestClient(create_app(tmp_path)) as client:
        response = client.post("/cenario-climatico/era5/estimar", json={
            "timestamp_utc": "2024-08-15T12:00:00Z",
            "availability": 1,
        })
    assert response.status_code == 202
    assert response.json()["status"] == "preparing"
