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
