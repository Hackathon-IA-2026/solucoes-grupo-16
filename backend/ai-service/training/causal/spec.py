"""Versioned contract for the first ClimaGrid causal estimand."""
from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path
from typing import Any

from training.protocol import canonical_bytes, sha256_json


SCHEMA_VERSION = "causal-estimand-v1"
TEMPORAL_MOST_SCHEMA_VERSION = "causal-estimand-v2"
LEGACY_CONTROL_SET = "legacy-v1"
TEMPORAL_MOST_CONTROL_SET = "temporal-most-v2"

DEFAULT_CONTROLS = (
    "wind_speed_100m",
    "wind_dir_sin",
    "wind_dir_cos",
    "hour_sin",
    "hour_cos",
    "doy_sin",
    "doy_cos",
    "capacidade_instalada_mw",
    "disponibilidade",
    "era5_distance_km",
    "era5_distance_known",
    "usina_id",
)

TEMPORAL_MOST_CONTROLS = (
    "wind_speed_hub_m",
    "wind_dir_sin",
    "wind_dir_cos",
    "wind_speed_mean_3h",
    "wind_speed_std_3h",
    "u_mean_3h",
    "v_mean_3h",
    "wind_speed_mean_6h",
    "wind_speed_std_6h",
    "u_mean_6h",
    "v_mean_6h",
    "wind_speed_gradient_1h",
    "wind_speed_gradient_3h",
    "wind_speed_gradient_6h",
    "hour_sin",
    "hour_cos",
    "doy_sin",
    "doy_cos",
    "capacidade_instalada_mw",
    "era5_distance_km",
    "era5_distance_known",
    "usina_id",
)

CONTROL_SETS = {
    LEGACY_CONTROL_SET: frozenset(DEFAULT_CONTROLS),
    TEMPORAL_MOST_CONTROL_SET: frozenset((*TEMPORAL_MOST_CONTROLS, "disponibilidade")),
}
FORBIDDEN_CONTROLS = frozenset({
    "air_density_kg_m3",
    "temperature_2m",
    "surface_pressure",
    "target_mw",
    "target_cf",
    "residual_cf",
    "baseline_mw",
    "geracao_referencia_mw",
    "geracao_verificada_mw",
})


@dataclass(frozen=True)
class CausalEstimandSpec:
    """Declare a versioned causal question before inspecting its results."""

    estimand_id: str = "air-density-on-physical-residual-v1"
    treatment: str = "air_density_kg_m3"
    outcome: str = "residual_cf"
    controls: tuple[str, ...] = DEFAULT_CONTROLS
    control_set_version: str = LEGACY_CONTROL_SET
    n_crossfit_splits: int = 4
    crossfit_gap_hours: int = 0
    inference_cluster_hours: int = 168
    minimum_oof_rows: int = 100
    minimum_treatment_residual_std: float = 1e-4
    expected_effect_sign: str = "positive"
    status: str = "exploratory"
    schema_version: str = SCHEMA_VERSION

    def __post_init__(self) -> None:
        expected_schema = {
            LEGACY_CONTROL_SET: SCHEMA_VERSION,
            TEMPORAL_MOST_CONTROL_SET: TEMPORAL_MOST_SCHEMA_VERSION,
        }.get(self.control_set_version)
        if expected_schema is None or self.schema_version != expected_schema:
            raise ValueError("Versão do contrato causal incompatível com o conjunto de controles.")
        if not self.estimand_id.strip():
            raise ValueError("estimand_id não pode ser vazio.")
        if self.treatment != "air_density_kg_m3" or self.outcome != "residual_cf":
            raise ValueError("O contrato v1 estima densidade do ar sobre residual_cf.")
        controls = tuple(self.controls)
        if not controls or len(controls) != len(set(controls)):
            raise ValueError("Controles causais devem ser únicos e não vazios.")
        if forbidden := sorted(set(controls) & FORBIDDEN_CONTROLS):
            raise ValueError(f"Controles determinísticos, alvo ou pós-resultado são proibidos: {forbidden}.")
        allowed = CONTROL_SETS[self.control_set_version]
        if unsupported := sorted(set(controls) - allowed):
            raise ValueError(
                f"Controles não suportados por {self.control_set_version}: {unsupported}."
            )
        if self.control_set_version == LEGACY_CONTROL_SET:
            if "wind_speed_100m" not in controls or "usina_id" not in controls:
                raise ValueError("O estimando v1 exige vento e identidade da usina como controles.")
        elif not set(TEMPORAL_MOST_CONTROLS) <= set(controls):
            missing = sorted(set(TEMPORAL_MOST_CONTROLS) - set(controls))
            raise ValueError(f"O estimando temporal/MOST exige controles completos: {missing}.")
        if (type(self.n_crossfit_splits) is not int or self.n_crossfit_splits < 2
                or type(self.crossfit_gap_hours) is not int or self.crossfit_gap_hours < 0
                or type(self.inference_cluster_hours) is not int or self.inference_cluster_hours < 1
                or type(self.minimum_oof_rows) is not int or self.minimum_oof_rows < 1
                or self.minimum_treatment_residual_std <= 0):
            raise ValueError("Parâmetros temporais e mínimos do estimando causal são inválidos.")
        if self.expected_effect_sign not in {"positive", "negative", "unknown"}:
            raise ValueError("expected_effect_sign deve ser positive, negative ou unknown.")
        if self.status not in {"infrastructure_test", "exploratory", "frozen"}:
            raise ValueError("Estado do estimando causal inválido.")
        object.__setattr__(self, "controls", controls)

    @property
    def requires_temporal_most_features(self) -> bool:
        return self.control_set_version == TEMPORAL_MOST_CONTROL_SET

    def validate_feature_config(self, feature_config: Any) -> None:
        if self.requires_temporal_most_features:
            if not feature_config.most_enabled:
                raise ValueError("O estimando temporal/MOST exige most_enabled=true.")
            if not feature_config.require_complete_history:
                raise ValueError("O estimando temporal/MOST exige histórico completo de 6 horas.")

    @classmethod
    def from_dict(cls, values: dict[str, Any]) -> "CausalEstimandSpec":
        data = dict(values)
        if "controls" in data:
            data["controls"] = tuple(data["controls"])
        return cls(**data)

    @classmethod
    def load(cls, path: Path) -> "CausalEstimandSpec":
        return cls.from_dict(json.loads(path.read_text(encoding="utf-8")))

    def serializable(self) -> dict[str, Any]:
        return asdict(self)

    def digest(self) -> str:
        return sha256_json(self.serializable())

    def write(self, path: Path, *, overwrite: bool = False) -> None:
        if path.exists() and not overwrite:
            raise FileExistsError("Contrato causal é imutável; escreva uma nova versão.")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(canonical_bytes(self.serializable()) + b"\n")
