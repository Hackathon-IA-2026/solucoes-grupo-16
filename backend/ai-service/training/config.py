"""Single source of truth for Phase 1 input names and model settings."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
import json
import math
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

    def __post_init__(self) -> None:
        names = list(asdict(self).values())
        if any(not isinstance(name, str) or not name.strip() for name in names) or len(set(names)) != len(names):
            raise ValueError("Mapeamento de colunas deve conter nomes únicos e não vazios.")

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

    def __post_init__(self) -> None:
        values = (self.cut_in_ms, self.rated_ms, self.cut_out_ms)
        if not all(math.isfinite(v) for v in values) or not 0 <= values[0] < values[1] < values[2] <= 50:
            raise ValueError("Exija 0 <= cut-in < rated < cut-out <= 50 m/s.")


@dataclass(frozen=True)
class LightGBMConfig:
    learning_rate: float = 0.04
    n_estimators: int = 2500
    num_leaves: int = 31
    min_child_samples: int = 100
    subsample: float = 0.8
    colsample_bytree: float = 0.8
    reg_lambda: float = 5.0

    def __post_init__(self) -> None:
        if (not math.isfinite(self.learning_rate) or self.learning_rate <= 0
                or type(self.n_estimators) is not int or self.n_estimators < 1
                or type(self.num_leaves) is not int or self.num_leaves < 2
                or type(self.min_child_samples) is not int or self.min_child_samples < 1
                or not math.isfinite(self.subsample) or not 0 < self.subsample <= 1
                or not math.isfinite(self.colsample_bytree) or not 0 < self.colsample_bytree <= 1
                or not math.isfinite(self.reg_lambda) or self.reg_lambda < 0):
            raise ValueError("Hiperparâmetros LightGBM inválidos.")


@dataclass(frozen=True)
class TrainingConfig:
    target: str | None = None
    model_version: str = "wind-power-global-v1"
    scope: str = "global"
    random_state: int = 42
    min_interval_samples: int = 20
    n_jobs: int = 1
    source_timezone: str | None = None
    usina_id: str | None = None
    allow_multiple_plants: bool = False
    start_utc: str | None = None
    experiment_days: int = 30
    columns: ColumnConfig = field(default_factory=ColumnConfig)
    physical_curve: PhysicalCurveConfig = field(default_factory=PhysicalCurveConfig)
    lightgbm: LightGBMConfig = field(default_factory=LightGBMConfig)

    def __post_init__(self) -> None:
        self.columns.target_name(self.target)
        if (self.scope != "global" or self.experiment_days < 1 or self.min_interval_samples < 1
                or self.n_jobs == 0 or type(self.allow_multiple_plants) is not bool
                or (self.allow_multiple_plants and self.usina_id is not None)):
            raise ValueError("Configuração inválida para o experimento global mínimo.")

    def target_column(self) -> str:
        column = self.columns.target_name(self.target)
        if not column:
            raise ValueError(
                "Treino real bloqueado: defina --target como geracao_referencia_mw "
                "ou geracao_verificada_mw após validar sua semântica com o especialista ONS."
            )
        # All downstream code receives canonicalized columns.
        return self.target

    def serializable(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, values: dict[str, Any]) -> "TrainingConfig":
        values = dict(values)
        values["columns"] = ColumnConfig(**values.get("columns", {}))
        values["physical_curve"] = PhysicalCurveConfig(**values.get("physical_curve", {}))
        values["lightgbm"] = LightGBMConfig(**values.get("lightgbm", {}))
        return cls(**values)


def load_config(path: Path | None = None, target: str | None = None) -> TrainingConfig:
    values = json.loads(path.read_text(encoding="utf-8")) if path else {}
    if target is not None:
        values["target"] = target
    return TrainingConfig.from_dict(values)


def service_root() -> Path:
    return Path(__file__).resolve().parents[1]


def default_artifact_dir() -> Path:
    configured = os.getenv("CLIMAGRID_ARTIFACT_DIR")
    return Path(configured) if configured else service_root() / "artifacts" / "global" / "v1"
