"""Historical replay backed by observed ONS generation joined to ERA5 weather."""
from __future__ import annotations

import math
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pandas as pd

from app.predictor import Predictor
from app.schemas import (
    HistoricalAvailabilityResponse,
    HistoricalBusAllocation,
    HistoricalPlantObservation,
    HistoricalReplayRequest,
    HistoricalReplayResponse,
)


SERVICE_ROOT = Path(__file__).resolve().parents[1]
REQUIRED_SNAPSHOT_COLUMNS = {
    "usina_id",
    "timestamp_utc",
    "capacidade_instalada_mw",
    "geracao_verificada_mw",
    "u100",
    "v100",
}


class HistoricalDataUnavailable(RuntimeError):
    pass


def _configured_path(variable: str, default: str) -> Path:
    configured = Path(os.getenv(variable, default))
    return configured if configured.is_absolute() else SERVICE_ROOT / configured


def _snapshot_path() -> Path:
    configured = os.getenv("CLIMAGRID_HISTORICAL_SNAPSHOT") or os.getenv(
        "CLIMAGRID_TRAINING_SNAPSHOT"
    )
    if configured:
        path = Path(configured)
        return path if path.is_absolute() else SERVICE_ROOT / path
    return SERVICE_ROOT / "data/processed/historical/observations.parquet"


@dataclass
class HistoricalScenarioService:
    predictor: Predictor
    snapshot_path: Path
    catalog_path: Path
    data_root: Path
    mapping_path: Path | None = None

    @classmethod
    def from_environment(cls, predictor: Predictor) -> "HistoricalScenarioService":
        return cls(
            predictor=predictor,
            snapshot_path=_snapshot_path(),
            catalog_path=_configured_path(
                "CLIMAGRID_PLANT_CATALOG",
                "data/processed/reference/plant_locations.parquet",
            ),
            data_root=_configured_path("CLIMAGRID_DATA_ROOT", "data"),
            mapping_path=_configured_path(
                "CLIMAGRID_PWF_MAPPING",
                "data/processed/reference/pwf_bus_mapping.parquet",
            ),
        )

    def capabilities(self) -> dict:
        era5_partitions = list(
            (self.data_root / "processed" / "era5").glob(
                "year=*/month=*/weather_hourly.parquet"
            )
        )
        ons_snapshots = list((self.data_root / "raw" / "ons").glob("**/*.parquet"))
        availability = self.availability()
        return {
            "status": "ok",
            "model": self.predictor.health(),
            "data": {
                "plant_catalog_available": self.catalog_path.is_file(),
                "ons_raw_available": bool(ons_snapshots),
                "era5_processed_available": bool(era5_partitions),
                "era5_partition_count": len(era5_partitions),
                "joined_snapshot_available": availability.available,
                "joined_snapshot_date": self._snapshot_date()
                if availability.available
                else None,
                "historical_first_timestamp": availability.first_timestamp,
                "historical_last_timestamp": availability.last_timestamp,
                "historical_latest_timestamp": availability.latest_timestamp,
                "historical_instant_count": availability.instant_count,
            },
            "features": {
                "historical_replay": availability.available,
                "historical_estimates": False,
                "climate_file_upload": self.catalog_path.is_file(),
                "physical_fallback": True,
            },
        }

    def availability(self) -> HistoricalAvailabilityResponse:
        if not self.snapshot_path.is_file():
            return HistoricalAvailabilityResponse(available=False)
        try:
            timestamps = pd.read_parquet(
                self.snapshot_path, columns=["timestamp_utc"]
            )["timestamp_utc"]
        except (KeyError, OSError, ValueError):
            return HistoricalAvailabilityResponse(available=False)
        timestamps = pd.to_datetime(timestamps, utc=True, errors="coerce").dropna()
        unique = timestamps.drop_duplicates().sort_values()
        if unique.empty:
            return HistoricalAvailabilityResponse(available=False)
        first = unique.iloc[0].to_pydatetime()
        last = unique.iloc[-1].to_pydatetime()
        return HistoricalAvailabilityResponse(
            available=True,
            first_timestamp=first,
            last_timestamp=last,
            latest_timestamp=last,
            instant_count=int(len(unique)),
        )

    def replay(self, request: HistoricalReplayRequest) -> HistoricalReplayResponse:
        snapshot = self._load_snapshot()
        selected_timestamp = pd.Timestamp(request.timestamp).tz_convert("UTC").floor("h")
        snapshot = snapshot[snapshot["timestamp_utc"].eq(selected_timestamp)].copy()
        if snapshot.empty:
            availability = self.availability()
            period = ""
            if availability.first_timestamp and availability.last_timestamp:
                period = (
                    f" O período disponível vai de {availability.first_timestamp.isoformat()}"
                    f" a {availability.last_timestamp.isoformat()}."
                )
            raise HistoricalDataUnavailable(
                "O snapshot histórico não contém observações no instante solicitado."
                + period
            )

        catalog = self._catalog_by_plant()
        bus_allocations = self._bus_allocations(selected_timestamp)
        observations: list[HistoricalPlantObservation] = []
        global_warnings: set[str] = set()
        numeric_columns = [
            "capacidade_instalada_mw",
            "geracao_verificada_mw",
            "u100",
            "v100",
        ]
        for column in numeric_columns:
            snapshot[column] = pd.to_numeric(snapshot[column], errors="coerce")
        snapshot = snapshot.dropna(subset=numeric_columns)

        for row in snapshot.sort_values("usina_id").itertuples(index=False):
            capacity = float(row.capacidade_instalada_mw)
            generation = float(row.geracao_verificada_mw)
            if capacity <= 0 or generation < 0:
                continue
            u100 = float(row.u100)
            v100 = float(row.v100)
            speed = math.hypot(u100, v100)
            direction = (math.degrees(math.atan2(-u100, -v100)) + 360) % 360
            capacity_factor = generation / capacity * 100
            warnings: list[str] = []
            if capacity_factor > 105:
                warnings.append("geracao_acima_da_capacidade_cadastrada")
                global_warnings.add(
                    "ha_usinas_com_geracao_acima_da_capacidade_cadastrada"
                )
            usina_id = str(row.usina_id)
            metadata = catalog.get(usina_id, {})
            allocation_data = bus_allocations.get(usina_id, {})
            allocation_rows = allocation_data.get("allocations", [])
            mapping_coverage = float(allocation_data.get("coverage", 0))
            if not allocation_rows:
                warnings.append("mapeamento_pwf_ausente")
                global_warnings.add("ha_usinas_sem_mapeamento_pwf")
            elif mapping_coverage < 100:
                warnings.append("mapeamento_pwf_parcial")
                global_warnings.add("ha_usinas_com_mapeamento_pwf_parcial")
            observations.append(
                HistoricalPlantObservation(
                    usina_id=usina_id,
                    ons_id=usina_id,
                    name=str(metadata.get("name") or usina_id),
                    state=str(metadata.get("state") or "NE"),
                    latitude=metadata.get("latitude"),
                    longitude=metadata.get("longitude"),
                    installed_capacity_mw=round(capacity, 6),
                    observed_generation_mw=round(generation, 6),
                    capacity_factor_percent=round(capacity_factor, 3),
                    u100=round(u100, 6),
                    v100=round(v100, 6),
                    wind_speed_mps=round(speed, 6),
                    wind_direction_degrees=round(direction, 3),
                    generation_source="ONS_GERACAO_USINA_2_HO",
                    weather_source="ERA5",
                    suggested_bus_allocations=[
                        HistoricalBusAllocation(
                            bus_number=int(item["bus_number"]),
                            bus_name=str(item["bus_name"]),
                            allocation_factor=round(float(item["allocation_factor"]), 9),
                            allocated_generation_mw=round(
                                generation * float(item["allocation_factor"]), 6
                            ),
                        )
                        for item in allocation_rows
                    ],
                    mapping_coverage_percent=round(mapping_coverage, 3),
                    warnings=warnings,
                )
            )

        if not observations:
            raise HistoricalDataUnavailable(
                "Não há observações válidas de usinas no instante solicitado."
            )

        snapshot_date = self._snapshot_date()
        return HistoricalReplayResponse(
            scenario_id=str(uuid4()),
            subsystem="NE",
            timestamp=selected_timestamp.to_pydatetime(),
            resolution_minutes=60,
            snapshot_date=snapshot_date,
            data_version=f"ons-era5-observed-{snapshot_date}",
            generation_source="ONS_GERACAO_USINA_2_HO",
            weather_source="ERA5",
            observations=observations,
            warnings=sorted(global_warnings),
        )

    def _load_snapshot(self) -> pd.DataFrame:
        if not self.snapshot_path.is_file():
            raise HistoricalDataUnavailable(
                "O snapshot histórico ONS + ERA5 ainda não existe. Execute o download "
                "da geração ONS, processe o ERA5 e rode o comando join-ons."
            )
        snapshot = pd.read_parquet(self.snapshot_path)
        missing = sorted(REQUIRED_SNAPSHOT_COLUMNS - set(snapshot.columns))
        if missing:
            raise HistoricalDataUnavailable(
                f"O snapshot histórico não possui as colunas obrigatórias: {missing}."
            )
        snapshot = snapshot.copy()
        snapshot["usina_id"] = snapshot["usina_id"].astype("string").str.strip()
        snapshot["timestamp_utc"] = pd.to_datetime(
            snapshot["timestamp_utc"], utc=True, errors="coerce"
        )
        if snapshot.duplicated(["usina_id", "timestamp_utc"]).any():
            raise HistoricalDataUnavailable(
                "O snapshot histórico possui mais de uma observação para a mesma usina e hora."
            )
        return snapshot

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
                return float(
                    (values[valid] * weights[valid]).sum() / weights[valid].sum()
                )

            first = rows.iloc[0]
            result[str(usina_id)] = {
                "name": first.get("nom_usina_ons")
                or first.get("nom_empreendimento_siga"),
                "state": first.get("uf_ons") or first.get("uf_siga"),
                "latitude": weighted("latitude"),
                "longitude": weighted("longitude"),
            }
        return result

    def _bus_allocations(self, timestamp: pd.Timestamp) -> dict[str, dict]:
        if self.mapping_path is None or not self.mapping_path.is_file():
            return {}
        mapping = pd.read_parquet(self.mapping_path)
        required = {
            "usina_id",
            "location_id",
            "bus_number",
            "pwf_plant_name",
            "allocation_capacity_mw",
        }
        if not required.issubset(mapping.columns):
            return {}
        mapping = mapping.copy()
        mapping["allocation_capacity_mw"] = pd.to_numeric(
            mapping["allocation_capacity_mw"], errors="coerce"
        )
        active = pd.Series(True, index=mapping.index)
        if "relationship_start" in mapping:
            start = pd.to_datetime(mapping["relationship_start"], utc=True, errors="coerce")
            active &= start.isna() | start.le(timestamp)
        if "relationship_end" in mapping:
            end = pd.to_datetime(mapping["relationship_end"], utc=True, errors="coerce")
            active &= end.isna() | end.add(pd.Timedelta(days=1)).gt(timestamp)
        mapping = mapping.loc[
            active & mapping["allocation_capacity_mw"].gt(0)
        ].copy()

        result: dict[str, dict] = {}
        for usina_id, rows in mapping.groupby("usina_id", sort=False):
            members = int(
                rows["group_member_count"].iloc[0]
                if "group_member_count" in rows
                else rows["location_id"].nunique()
            )
            mapped_members = int(
                rows["mapped_member_count"].iloc[0]
                if "mapped_member_count" in rows
                else rows.loc[rows["bus_number"].notna(), "location_id"].nunique()
            )
            buses = (
                rows.groupby(["bus_number", "pwf_plant_name"], as_index=False)[
                    "allocation_capacity_mw"
                ]
                .sum()
                .sort_values("bus_number")
            )
            total_capacity = float(buses["allocation_capacity_mw"].sum())
            if total_capacity <= 0:
                continue
            result[str(usina_id)] = {
                "coverage": mapped_members / members * 100 if members else 0,
                "allocations": [
                    {
                        "bus_number": int(row.bus_number),
                        "bus_name": str(row.pwf_plant_name),
                        "allocation_factor": float(
                            row.allocation_capacity_mw / total_capacity
                        ),
                    }
                    for row in buses.itertuples(index=False)
                ],
            }
        return result
