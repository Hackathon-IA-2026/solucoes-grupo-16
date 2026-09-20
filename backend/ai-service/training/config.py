"""Single source of truth for Phase 1 input names and model settings."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
import os
from pathlib import Path
from typing import Any


ALLOWED_TARGETS = ("geracao_referencia_mw", "geracao_verificada_mw")


@dataclass(frozen=True)
class ColumnConfig:
    """Canonical names; map real ONS/ERA5 fields explicitly before training."""

    usina_id: str = "usina_id"
    timestamp_utc: str = "timestamp_utc"
    capacidade_instalada_mw: str = "capacidade_instalada_mw"
    disponibilidade: str = "disponibilidade"
    u100: str = "u100"
    v100: str = "v100"
    temperature_2m: str = "temperature_2m"
    surface_pressure: str = "surface_pressure"
    era5_distance_km: str = "era5_distance_km"
    geracao_referencia_mw: str = "geracao_referencia_mw"
    geracao_verificada_mw: str = "geracao_verificada_mw"

    def required_base(self) -> list[str]:
        return [
            self.usina_id,
            self.timestamp_utc,
            self.capacidade_instalada_mw,
            self.disponibilidade,
            self.u100,
            self.v100,
            self.temperature_2m,
            self.surface_pressure,
        ]

    def target_name(self, target: str | None) -> str | None:
        if target is None:
            return None
        if target not in ALLOWED_TARGETS:
            raise ValueError(f"Target inválido: {target}. Use um de {ALLOWED_TARGETS}.")
        return getattr(self, target)


@dataclass(frozen=True)
class PhysicalCurveConfig:
    cut_in_ms: float = 3.0
    rated_ms: float = 12.0
    cut_out_ms: float = 25.0


@dataclass(frozen=True)
class TrainingConfig:
    target: str | None = None
    model_version: str = "wind-power-global-v1"
    scope: str = "global"
    random_state: int = 42
    min_interval_samples: int = 20
    columns: ColumnConfig = field(default_factory=ColumnConfig)
    physical_curve: PhysicalCurveConfig = field(default_factory=PhysicalCurveConfig)

    def target_column(self) -> str:
        column = self.columns.target_name(self.target)
        if not column:
            raise ValueError(
                "Treino real bloqueado: defina --target como geracao_referencia_mw "
                "ou geracao_verificada_mw após validar sua semântica com o especialista ONS."
            )
        return column

    def serializable(self) -> dict[str, Any]:
        return asdict(self)


def service_root() -> Path:
    return Path(__file__).resolve().parents[1]


def default_artifact_dir() -> Path:
    configured = os.getenv("CLIMAGRID_ARTIFACT_DIR")
    return Path(configured) if configured else service_root() / "artifacts" / "global" / "v1"
