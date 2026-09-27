"""Historical replay backed by observed ONS generation joined to ERA5 weather."""
from __future__ import annotations

import math
import os
import json
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from uuid import uuid4

import pandas as pd
from ingestion.common.io import sha256_file

from app.predictor import Predictor
from app.historical_ingestion import (on_demand_configured, prepare_era5_partition,
                                      prepare_replay_partition, replay_partition,
                                      validate_era5_scenario_date, validate_replay_date,
                                      weather_partition)
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
    configured = os.getenv("CLIMAGRID_HISTORICAL_SNAPSHOT")
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
    _jobs: dict[str, Future] = field(default_factory=dict, init=False, repr=False)
    _jobs_lock: Lock = field(default_factory=Lock, init=False, repr=False)
    _executor: ThreadPoolExecutor = field(default_factory=lambda: ThreadPoolExecutor(max_workers=1), init=False, repr=False)

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
        era5_partitions.extend(
            (self.data_root / "processed" / "historical").glob(
                "year=*/month=*/utc=*/weather_hourly.parquet"
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
                "historical_replay": availability.available or on_demand_configured(),
                "historical_on_demand": on_demand_configured(),
                "historical_estimates": False,
                "climate_file_upload": self.catalog_path.is_file(),
                "climate_era5_scenario": self.catalog_path.is_file()
                and (bool(era5_partitions) or on_demand_configured()),
                "physical_fallback": True,
            },
        }

    def availability(self) -> HistoricalAvailabilityResponse:
        paths = [self.snapshot_path, *(self.data_root / "processed" / "historical").glob(
            "year=*/month=*/observations_utc_*.parquet"
        )]
        paths = [path for path in paths if path.is_file()]
        if not paths:
            return HistoricalAvailabilityResponse(available=False)
        series = []
        for path in paths:
            try:
                # Availability is queried while an on-demand partition may be
                # using most of the service memory. Reading the other replay
                # columns here creates avoidable allocations on every poll.
                series.append(pd.read_parquet(path, columns=["timestamp_utc"])["timestamp_utc"])
            except (KeyError, OSError, ValueError):
                continue
        if not series:
            return HistoricalAvailabilityResponse(available=False)
        timestamps = pd.to_datetime(pd.concat(series, ignore_index=True), utc=True, errors="coerce").dropna()
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

    def request_replay(self, request: HistoricalReplayRequest) -> HistoricalReplayResponse | dict:
        selected = pd.Timestamp(request.timestamp).tz_convert("UTC").floor("h")
        if self._find_snapshot(selected) is not None:
            return self.replay(request)
        try:
            validate_era5_scenario_date(selected)
        except ValueError as exc:
            raise HistoricalDataUnavailable(str(exc)) from exc
        if not on_demand_configured():
            raise HistoricalDataUnavailable(
                "Esta hora não está no cache. Configure CDSAPI_KEY ou ~/.cdsapirc no AI service "
                "para baixar o ERA5 histórico sob demanda."
            )
        partition = replay_partition(self.data_root, selected)
        if partition.is_file():
            raise HistoricalDataUnavailable("A hora solicitada não consta na partição ONS–ERA5 processada.")
        key = str(partition)
        with self._jobs_lock:
            future = self._jobs.get(key)
            if future is None:
                if sum(not job.done() for job in self._jobs.values()) >= 2:
                    raise HistoricalDataUnavailable(
                        "Já há duas coletas históricas em andamento. Aguarde e tente novamente."
                    )
                future = self._executor.submit(prepare_replay_partition, self.data_root, selected)
                self._jobs[key] = future
        if not future.done():
            return {"status": "preparing", "message": "Baixando e conciliando a geração ONS e o ERA5. O primeiro acesso ao mês pode levar alguns minutos."}
        with self._jobs_lock:
            self._jobs.pop(key, None)
        try:
            future.result()
        except Exception as exc:
            raise HistoricalDataUnavailable(f"Falha na coleta histórica: {exc}") from exc
        return self.replay(request)

    def request_era5_weather(self, timestamp: datetime) -> Path | dict:
        """Return plant-level ERA5 weather, preparing the monthly cache when needed."""
        selected = pd.Timestamp(timestamp).tz_convert("UTC").floor("h")
        cached_weather = (self.data_root / "processed" / "era5"
                          / f"year={selected.year:04d}" / f"month={selected.month:02d}"
                          / "weather_hourly.parquet")
        weather = weather_partition(self.data_root, selected)
        for candidate in (weather, cached_weather):
            if self._weather_contains(candidate, selected):
                return candidate
        try:
            validate_replay_date(selected)
        except ValueError as exc:
            raise HistoricalDataUnavailable(str(exc)) from exc
        if not on_demand_configured():
            raise HistoricalDataUnavailable(
                "Esta hora não está no cache. Configure CDSAPI_KEY ou ~/.cdsapirc no AI service "
                "para baixar o ERA5 histórico sob demanda."
            )
        key = str(cached_weather)
        with self._jobs_lock:
            future = self._jobs.get(key)
            if future is None:
                if sum(not job.done() for job in self._jobs.values()) >= 2:
                    raise HistoricalDataUnavailable(
                        "Já há duas coletas históricas em andamento. Aguarde e tente novamente."
                    )
                future = self._executor.submit(
                    prepare_era5_partition,
                    self.data_root,
                    self.catalog_path,
                    selected,
                )
                self._jobs[key] = future
        if not future.done():
            return {
                "status": "preparing",
                "message": (
                    "Baixando e processando o ERA5. O primeiro acesso ao mês "
                    "pode levar alguns minutos."
                ),
            }
        with self._jobs_lock:
            self._jobs.pop(key, None)
        try:
            future.result()
        except Exception as exc:
            raise HistoricalDataUnavailable(f"Falha na coleta do ERA5: {exc}") from exc
        if not self._weather_contains(cached_weather, selected):
            raise HistoricalDataUnavailable(
                "A hora solicitada não possui vento ERA5 processado para os conjuntos cadastrados."
            )
        return cached_weather

    def catalog_path_for_timestamp(self, timestamp: datetime, weather: Path | None = None) -> Path:
        selected = pd.Timestamp(timestamp).tz_convert("UTC").floor("h")
        cached_weather = (self.data_root / "processed" / "era5"
                          / f"year={selected.year:04d}" / f"month={selected.month:02d}"
                          / "weather_hourly.parquet")
        if weather == cached_weather:
            return self.catalog_path
        monthly = replay_partition(self.data_root, selected).parent / "catalog.parquet"
        return monthly if monthly.is_file() else self.catalog_path

    def era5_provenance(self, timestamp: datetime, weather: Path) -> dict:
        selected = pd.Timestamp(timestamp).tz_convert("UTC").floor("h")
        report = replay_partition(self.data_root, selected).with_name(
            f"join_report_utc={selected.year:04d}-{selected.month:02d}.json"
        )
        details: dict = {
            "weather_data_version": f"era5-weather-sha256-{sha256_file(weather)}",
        }
        if report.is_file():
            try:
                payload = json.loads(report.read_text(encoding="utf-8"))
                if payload.get("era5_sha256"):
                    details["era5_sha256"] = payload["era5_sha256"]
            except (OSError, ValueError, TypeError):
                pass
        else:
            manifest = (self.data_root / "manifests" / "era5"
                        / f"year={selected.year:04d}" / f"month={selected.month:02d}"
                        / "download.json")
            if manifest.is_file():
                try:
                    payload = json.loads(manifest.read_text(encoding="utf-8"))
                    if payload.get("sha256"):
                        details["era5_sha256"] = payload["sha256"]
                except (OSError, ValueError, TypeError):
                    pass
        return details

    @staticmethod
    def _weather_contains(path: Path, selected: pd.Timestamp) -> bool:
        if not path.is_file():
            return False
        try:
            timestamps = pd.to_datetime(
                pd.read_parquet(path, columns=["timestamp_utc"])["timestamp_utc"],
                utc=True,
                errors="coerce",
            )
        except (OSError, KeyError, ValueError):
            return False
        return bool(timestamps.eq(selected).any())

    def _find_snapshot(self, selected: pd.Timestamp) -> Path | None:
        for path in (self.snapshot_path, replay_partition(self.data_root, selected)):
            if not path.is_file():
                continue
            try:
                hours = pd.to_datetime(
                    pd.read_parquet(path, columns=["timestamp_utc"])["timestamp_utc"], utc=True
                )
            except (OSError, KeyError, ValueError):
                continue
            if hours.eq(selected).any():
                return path
        return None

    def replay(self, request: HistoricalReplayRequest) -> HistoricalReplayResponse:
        selected_timestamp = pd.Timestamp(request.timestamp).tz_convert("UTC").floor("h")
        selected_path = self._find_snapshot(selected_timestamp) or self.snapshot_path
        snapshot = self._load_snapshot(selected_path)
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

        monthly_catalog = selected_path.parent / "catalog.parquet"
        catalog = self._catalog_by_plant(monthly_catalog if monthly_catalog.is_file() else None)
        bus_allocations = self._bus_allocations(selected_timestamp)
        observations: list[HistoricalPlantObservation] = []
        global_warnings: set[str] = set()
        if selected_path != self.snapshot_path:
            report_path = selected_path.with_name(
                f"join_report_utc={selected_timestamp.year:04d}-{selected_timestamp.month:02d}.json"
            )
            if report_path.is_file():
                report = json.loads(report_path.read_text(encoding="utf-8"))
                global_warnings.update(report.get("warnings", []))
            catalog_report_path = selected_path.parent / "catalog_report.json"
            if catalog_report_path.is_file():
                catalog_report = json.loads(catalog_report_path.read_text(encoding="utf-8"))
                if catalog_report.get("plant_coverage", 1) < 1:
                    global_warnings.add("ha_conjuntos_sem_localizacao_completa")
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

        snapshot_date = self._snapshot_date(selected_path)
        return HistoricalReplayResponse(
            scenario_id=str(uuid4()),
            subsystem="NE",
            timestamp=selected_timestamp.to_pydatetime(),
            resolution_minutes=60,
            snapshot_date=snapshot_date,
            data_version=f"ons-era5-observed-{snapshot_date}-{sha256_file(selected_path)[:12]}",
            generation_source="ONS_GERACAO_USINA_2_HO",
            weather_source="ERA5",
            observations=observations,
            warnings=sorted(global_warnings),
        )

    def _load_snapshot(self, path: Path | None = None) -> pd.DataFrame:
        path = path or self.snapshot_path
        if not path.is_file():
            raise HistoricalDataUnavailable(
                "O snapshot histórico ONS + ERA5 ainda não existe. Execute o download "
                "da geração ONS, processe o ERA5 e rode o comando join-ons."
            )
        snapshot = pd.read_parquet(path)
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

    def _snapshot_date(self, path: Path | None = None) -> str:
        if path is None and not self.snapshot_path.is_file():
            candidates = list((self.data_root / "processed" / "historical").glob(
                "year=*/month=*/observations_utc_*.parquet"
            ))
            if not candidates:
                raise HistoricalDataUnavailable("Nenhum snapshot histórico está disponível.")
            path = max(candidates, key=lambda item: item.stat().st_mtime)
        modified = datetime.fromtimestamp(
            (path or self.snapshot_path).stat().st_mtime, tz=timezone.utc
        )
        return modified.date().isoformat()

    def _catalog_by_plant(self, path: Path | None = None) -> dict[str, dict]:
        path = path or self.catalog_path
        if not path.is_file():
            return {}
        catalog = pd.read_parquet(path)
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
