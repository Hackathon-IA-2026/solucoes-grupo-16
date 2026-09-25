"""Pydantic contract for the internal ClimaGrid API."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

import math
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ClimateRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    timestamp_utc: datetime
    u100: float
    v100: float
    temperature_2m: float = Field(ge=150, le=350, description="Kelvin")
    surface_pressure: float = Field(ge=50_000, le=120_000, description="Pascal")
    disponibilidade: float | None = Field(default=None, ge=0, le=1)

    @field_validator("timestamp_utc")
    @classmethod
    def timestamp_requires_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp_utc deve conter timezone, por exemplo Z ou +00:00")
        return value.astimezone(timezone.utc)

    @model_validator(mode="after")
    def valid_derived_wind(self) -> "ClimateRecord":
        speed = math.hypot(self.u100, self.v100)
        if not 0 <= speed <= 50:
            raise ValueError("A velocidade derivada de u100/v100 deve estar entre 0 e 50 m/s")
        return self


class EstimationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    usina_id: str = Field(min_length=1, max_length=128)
    capacidade_instalada_mw: float = Field(gt=0)
    disponibilidade: float = Field(ge=0, le=1)
    registros: list[ClimateRecord] = Field(min_length=1, max_length=500)

    @field_validator("usina_id")
    @classmethod
    def nonblank_id(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("usina_id não pode ser vazio")
        return value.strip()

    @model_validator(mode="after")
    def ascending_timestamps(self) -> "EstimationRequest":
        timestamps = [record.timestamp_utc for record in self.registros]
        if timestamps != sorted(timestamps) or len(set(timestamps)) != len(timestamps):
            raise ValueError("registros devem ter timestamps únicos em ordem crescente")
        return self


class Prediction(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    timestamp_utc: datetime
    baseline_mw: float = Field(ge=0)
    correcao_ml_mw: float
    geracao_estimada_mw: float = Field(ge=0)
    limite_inferior_mw: float | None = Field(ge=0)
    limite_superior_mw: float | None = Field(ge=0)
    confianca: Literal["alta", "media", "baixa"]
    warnings: list[str]


class EstimationResponse(BaseModel):
    usina_id: str
    model_version: str
    model_scope: str
    predicoes: list[Prediction]


class HistoricalReplayRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subsystem: Literal["NE"] = "NE"
    timestamp: datetime
    resolution_minutes: Literal[60] = 60

    @field_validator("timestamp")
    @classmethod
    def historical_timestamp_requires_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp deve conter timezone")
        return value.astimezone(timezone.utc)


class HistoricalBusAllocation(BaseModel):
    bus_number: int = Field(gt=0)
    bus_name: str
    allocation_factor: float = Field(gt=0, le=1)
    allocated_generation_mw: float = Field(ge=0)


class HistoricalPlantObservation(BaseModel):
    usina_id: str
    ons_id: str
    name: str
    state: str
    latitude: float | None
    longitude: float | None
    installed_capacity_mw: float
    observed_generation_mw: float
    capacity_factor_percent: float | None
    u100: float
    v100: float
    wind_speed_mps: float
    wind_direction_degrees: float
    generation_source: Literal["ONS_GERACAO_USINA_2_HO"]
    weather_source: Literal["ERA5"]
    suggested_bus_allocations: list[HistoricalBusAllocation]
    mapping_coverage_percent: float = Field(ge=0, le=100)
    warnings: list[str]


class HistoricalReplayResponse(BaseModel):
    scenario_id: str
    subsystem: Literal["NE"]
    timestamp: datetime
    resolution_minutes: Literal[60]
    snapshot_date: str
    data_version: str
    generation_source: Literal["ONS_GERACAO_USINA_2_HO"]
    weather_source: Literal["ERA5"]
    observations: list[HistoricalPlantObservation]
    warnings: list[str]


class HistoricalAvailabilityResponse(BaseModel):
    available: bool
    first_timestamp: datetime | None = None
    last_timestamp: datetime | None = None
    latest_timestamp: datetime | None = None
    instant_count: int = 0
    resolution_minutes: Literal[60] = 60
