from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from app.historical import HistoricalScenarioService
from app.predictor import Predictor
from app.schemas import HistoricalScenarioRequest


def test_historical_scenario_uses_joined_snapshot_and_catalog(tmp_path: Path):
    snapshot = tmp_path / "snapshot.parquet"
    catalog = tmp_path / "catalog.parquet"
    data_root = tmp_path / "data"
    (data_root / "raw" / "ons").mkdir(parents=True)
    (data_root / "raw" / "ons" / "ons.parquet").write_bytes(b"snapshot")

    pd.DataFrame(
        {
            "usina_id": ["ONS_1", "ONS_1"],
            "timestamp_utc": [
                "2026-09-01T00:00:00Z",
                "2026-09-01T01:00:00Z",
            ],
            "capacidade_instalada_mw": [100.0, 100.0],
            "disponibilidade": [0.9, 0.8],
            "u100": [7.0, 8.0],
            "v100": [1.0, 1.0],
            "temperature_2m": [298.0, 299.0],
            "surface_pressure": [100_000.0, 100_100.0],
        }
    ).to_parquet(snapshot, index=False)
    pd.DataFrame(
        {
            "usina_id": ["ONS_1"],
            "capacidade_instalada_mw": [100.0],
            "nom_usina_ons": ["Parque Teste"],
            "uf_ons": ["RN"],
            "latitude": [-5.0],
            "longitude": [-36.0],
            "match_status": ["matched"],
        }
    ).to_parquet(catalog, index=False)

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
    service = HistoricalScenarioService(
        predictor=predictor,
        snapshot_path=snapshot,
        catalog_path=catalog,
        data_root=data_root,
    )

    capabilities = service.capabilities()
    assert capabilities["features"]["historical_estimates"] is True
    assert capabilities["data"]["ons_raw_available"] is True

    result = service.estimate(
        HistoricalScenarioRequest(
            subsystem="NE",
            start_at=datetime(2026, 9, 1, 0, tzinfo=timezone.utc),
            end_at=datetime(2026, 9, 1, 1, tzinfo=timezone.utc),
            resolution_minutes=60,
        )
    )

    assert result.model_scope == "physical_fallback"
    assert result.estimates[0].name == "Parque Teste"
    assert result.estimates[0].state == "RN"
    assert result.estimates[0].sample_count == 2
    assert result.estimates[0].historical_availability_percent == 85.0
    assert 0 <= result.estimates[0].estimated_generation_mw <= 85.0
