"""Pydantic contract for the internal ClimaGrid API."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

import math
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ClimateRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timestamp_utc: datetime
    u100: float
    v100: float
    temperature_2m: float = Field(ge=150, le=350, description="Kelvin")
    surface_pressure: float = Field(ge=50_000, le=120_000, description="Pascal")

    @field_validator("timestamp_utc")
    @classmethod
    def timestamp_requires_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp_utc deve conter timezone, por exemplo Z ou +00:00")
        return value

    @model_validator(mode="after")
    def valid_derived_wind(self) -> "ClimateRecord":
        speed = math.hypot(self.u100, self.v100)
        if not 0 <= speed <= 50:
            raise ValueError("A velocidade derivada de u100/v100 deve estar entre 0 e 50 m/s")
        return self


class EstimationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    usina_id: str = Field(min_length=1, max_length=128)
    capacidade_instalada_mw: float = Field(gt=0)
    disponibilidade: float = Field(ge=0, le=1)
    registros: list[ClimateRecord] = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def ascending_timestamps(self) -> "EstimationRequest":
        timestamps = [record.timestamp_utc for record in self.registros]
        if timestamps != sorted(timestamps):
            raise ValueError("registros devem estar em ordem crescente de timestamp_utc")
        return self


class Prediction(BaseModel):
    timestamp_utc: datetime
    baseline_mw: float
    correcao_ml_mw: float
    geracao_estimada_mw: float
    limite_inferior_mw: float
    limite_superior_mw: float
    confianca: Literal["alta", "media", "baixa"]
    warnings: list[str]


class EstimationResponse(BaseModel):
    usina_id: str
    model_version: str
    model_scope: str
    predicoes: list[Prediction]
