"""Historical scenario adapter backed by the joined ONS + ERA5 snapshot."""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pandas as pd

from app.predictor import Predictor
from app.schemas import (
    ClimateRecord,
    EstimationRequest,
    HistoricalEstimationResponse,
    HistoricalPlantEstimate,
    HistoricalScenarioRequest,
)


SERVICE_ROOT = Path(__file__).resolve().parents[1]


class HistoricalDataUnavailable(RuntimeError):
    pass


def _configured_path(variable: str, default: str) -> Path:
    configured = Path(os.getenv(variable, default))
    return configured if configured.is_absolute() else SERVICE_ROOT / configured


@dataclass
class HistoricalScenarioService:
    predictor: Predictor
    snapshot_path: Path
    catalog_path: Path
    data_root: Path

    @classmethod
    def from_environment(cls, predictor: Predictor) -> "HistoricalScenarioService":
        return cls(
            predictor=predictor,
            snapshot_path=_configured_path(
                "CLIMAGRID_TRAINING_SNAPSHOT",
                "data/processed/training/snapshot_unido.parquet",
            ),
            catalog_path=_configured_path(
                "CLIMAGRID_PLANT_CATALOG",
                "data/processed/reference/plant_locations.parquet",
            ),
            data_root=_configured_path("CLIMAGRID_DATA_ROOT", "data"),
        )

    def capabilities(self) -> dict:
        era5_partitions = list(
            (self.data_root / "processed" / "era5").glob(
                "year=*/month=*/weather_hourly.parquet"
            )
        )
        ons_snapshots = list((self.data_root / "raw" / "ons").glob("*.parquet"))
        joined_available = self.snapshot_path.is_file()
        return {
            "status": "ok",
            "model": self.predictor.health(),
            "data": {
                "plant_catalog_available": self.catalog_path.is_file(),
                "ons_raw_available": bool(ons_snapshots),
                "era5_processed_available": bool(era5_partitions),
                "era5_partition_count": len(era5_partitions),
                "joined_snapshot_available": joined_available,
                "joined_snapshot_date": self._snapshot_date()
                if joined_available
                else None,
            },
            "features": {
                "historical_estimates": joined_available,
                "climate_file_upload": False,
                "physical_fallback": True,
            },
        }

    def estimate(self, request: HistoricalScenarioRequest) -> HistoricalEstimationResponse:
        if not self.snapshot_path.is_file():
            raise HistoricalDataUnavailable(
                "O snapshot unido ONS + ERA5 ainda não existe. Execute o backfill "
                "ERA5 e o comando join-ons antes de processar um cenário histórico."
            )

        snapshot = pd.read_parquet(self.snapshot_path)
        required = {
            "usina_id",
            "timestamp_utc",
            "capacidade_instalada_mw",
            "disponibilidade",
            "u100",
            "v100",
            "temperature_2m",
            "surface_pressure",
        }
        missing = sorted(required - set(snapshot.columns))
        if missing:
            raise HistoricalDataUnavailable(
                f"O snapshot unido não possui as colunas obrigatórias: {missing}."
            )

        snapshot = snapshot.copy()
        snapshot["timestamp_utc"] = pd.to_datetime(
            snapshot["timestamp_utc"], utc=True, errors="coerce"
        )
        start = pd.Timestamp(request.start_at).tz_convert("UTC")
        end = pd.Timestamp(request.end_at).tz_convert("UTC")
        snapshot = snapshot[
            snapshot["timestamp_utc"].between(start, end, inclusive="both")
        ].copy()
        if snapshot.empty:
            raise HistoricalDataUnavailable(
                "O snapshot unido não contém registros no período solicitado."
            )

        catalog = self._catalog_by_plant()
        estimates: list[HistoricalPlantEstimate] = []
        scopes: set[str] = set()
        all_warnings: set[str] = {"geracao_representa_a_media_horaria_do_periodo"}

        for usina_id, rows in snapshot.groupby("usina_id", sort=True):
            rows = rows.sort_values("timestamp_utc")
            numeric_columns = [
                "capacidade_instalada_mw",
                "disponibilidade",
                "u100",
                "v100",
                "temperature_2m",
                "surface_pressure",
            ]
            for column in numeric_columns:
                rows[column] = pd.to_numeric(rows[column], errors="coerce")
            rows = rows.dropna(subset=["timestamp_utc", *numeric_columns])
            rows = rows[
                rows["capacidade_instalada_mw"].gt(0)
                & rows["disponibilidade"].between(0, 1)
            ]
            if rows.empty:
                continue

            capacity = float(rows["capacidade_instalada_mw"].median())
            availability = float(rows["disponibilidade"].mean())
            model_request = EstimationRequest(
                usina_id=str(usina_id),
                capacidade_instalada_mw=capacity,
                disponibilidade=availability,
                registros=[
                    ClimateRecord(
                        timestamp_utc=row.timestamp_utc.to_pydatetime(),
                        u100=float(row.u100),
                        v100=float(row.v100),
                        temperature_2m=float(row.temperature_2m),
                        surface_pressure=float(row.surface_pressure),
                        disponibilidade=float(row.disponibilidade),
                    )
                    for row in rows.itertuples(index=False)
                ],
            )
            result = self.predictor.estimate(model_request)
            scopes.add(result.model_scope)
            warnings = sorted(
                {warning for prediction in result.predicoes for warning in prediction.warnings}
            )
            all_warnings.update(warnings)
            metadata = catalog.get(str(usina_id), {})
            confidences = {prediction.confianca for prediction in result.predicoes}
            confidence = "baixa" if "baixa" in confidences else "media"
            estimates.append(
                HistoricalPlantEstimate(
                    usina_id=str(usina_id),
                    ons_id=str(usina_id),
                    name=str(metadata.get("name") or usina_id),
                    state=str(metadata.get("state") or "NE"),
                    latitude=metadata.get("latitude"),
                    longitude=metadata.get("longitude"),
                    installed_capacity_mw=round(capacity, 6),
                    estimated_generation_mw=round(
                        sum(item.geracao_estimada_mw for item in result.predicoes)
                        / len(result.predicoes),
                        6,
                    ),
                    confidence_low_mw=round(
                        sum(item.limite_inferior_mw for item in result.predicoes)
                        / len(result.predicoes),
                        6,
                    ) if all(item.limite_inferior_mw is not None for item in result.predicoes) else None,
                    confidence_high_mw=round(
                        sum(item.limite_superior_mw for item in result.predicoes)
                        / len(result.predicoes),
                        6,
                    ) if all(item.limite_superior_mw is not None for item in result.predicoes) else None,
                    confidence=confidence,
                    historical_availability_percent=round(availability * 100, 3),
                    sample_count=len(result.predicoes),
                    warnings=warnings,
                )
            )

        if not estimates:
            raise HistoricalDataUnavailable(
                "Não há registros válidos de usinas no período solicitado."
            )

        snapshot_date = self._snapshot_date()
        return HistoricalEstimationResponse(
            scenario_id=str(uuid4()),
            subsystem="NE",
            start_at=request.start_at,
            end_at=request.end_at,
            resolution_minutes=60,
            snapshot_date=snapshot_date,
            data_version=f"snapshot-ons-era5-{snapshot_date}",
            model_version=self.predictor.version,
            model_scope=next(iter(scopes)) if len(scopes) == 1 else "mixed",
            model_approved=self.predictor.approved,
            estimates=estimates,
            warnings=sorted(all_warnings),
        )

    def _snapshot_date(self) -> str:
        modified = datetime.fromtimestamp(
            self.snapshot_path.stat().st_mtime, tz=timezone.utc
        )
        return modified.date().isoformat()

    def _catalog_by_plant(self) -> dict[str, dict]:
        if not self.catalog_path.is_file():
            return {}
        catalog = pd.read_parquet(self.catalog_path)
        required = {"usina_id", "capacidade_instalada_mw"}
        if not required.issubset(catalog.columns):
            return {}
        if "match_status" in catalog:
            catalog = catalog[catalog["match_status"].eq("matched")]
        catalog = catalog.copy()
        catalog["capacidade_instalada_mw"] = pd.to_numeric(
            catalog["capacidade_instalada_mw"], errors="coerce"
        ).fillna(0)
        result: dict[str, dict] = {}
        for usina_id, rows in catalog.groupby("usina_id", sort=False):
            weights = rows["capacidade_instalada_mw"].clip(lower=0)
            weight_sum = float(weights.sum())

            def weighted(column: str) -> float | None:
                if column not in rows or weight_sum <= 0:
                    return None
                values = pd.to_numeric(rows[column], errors="coerce")
                valid = values.notna() & weights.gt(0)
                if not valid.any():
                    return None
                return float((values[valid] * weights[valid]).sum() / weights[valid].sum())

            first = rows.iloc[0]
            result[str(usina_id)] = {
                "name": first.get("nom_usina_ons") or first.get("nom_empreendimento_siga"),
                "state": first.get("uf_ons") or first.get("uf_siga"),
                "latitude": weighted("latitude"),
                "longitude": weighted("longitude"),
            }
        return result
