"""Versioned temporal-protocol contract and immutable state transitions.

The protocol deliberately contains no model code.  It is the authorization
boundary used by split, tuning, calibration and final-test jobs.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field, replace
from datetime import datetime, timezone
from enum import StrEnum
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable

import pandas as pd


SCHEMA_VERSION = "temporal-protocol-v1"

SCIENTIFIC_PREREQUISITES = {
    "target_contract_approved",
    "eligibility_policy_approved",
    "exposed_periods_inventory_complete",
    "historical_coverage_approved",
    "validity_and_composition_approved",
    "feature_availability_confirmed",
    "granularity_decided",
    "most_decided",
}


class ProtocolState(StrEnum):
    INFRASTRUCTURE_TEST = "infrastructure_test"
    EXPLORATORY = "exploratory"
    PROTOCOL_FROZEN = "protocol_frozen"
    MODEL_FROZEN = "model_frozen"
    CALIBRATION_FROZEN = "calibration_frozen"
    FINAL_TEST_CONSUMED = "final_test_consumed"
    OPERATIONALLY_HOMOLOGATED = "operationally_homologated"


_TRANSITIONS = {
    ProtocolState.INFRASTRUCTURE_TEST: {ProtocolState.EXPLORATORY, ProtocolState.PROTOCOL_FROZEN},
    ProtocolState.EXPLORATORY: {ProtocolState.PROTOCOL_FROZEN},
    ProtocolState.PROTOCOL_FROZEN: {ProtocolState.MODEL_FROZEN},
    ProtocolState.MODEL_FROZEN: {ProtocolState.CALIBRATION_FROZEN},
    ProtocolState.CALIBRATION_FROZEN: {ProtocolState.FINAL_TEST_CONSUMED},
    ProtocolState.FINAL_TEST_CONSUMED: {ProtocolState.OPERATIONALLY_HOMOLOGATED},
    ProtocolState.OPERATIONALLY_HOMOLOGATED: set(),
}


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
                      allow_nan=False).encode("utf-8")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def _utc(value: str) -> pd.Timestamp:
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is None:
        raise ValueError("Limites temporais devem incluir timezone.")
    return timestamp.tz_convert("UTC")


@dataclass(frozen=True)
class TimeBlock:
    start_utc: str
    end_utc: str

    def __post_init__(self) -> None:
        start, end = _utc(self.start_utc), _utc(self.end_utc)
        if start >= end:
            raise ValueError("Intervalo temporal deve satisfazer start < end.")
        object.__setattr__(self, "start_utc", start.isoformat())
        object.__setattr__(self, "end_utc", end.isoformat())

    def contains(self, values: pd.Series) -> pd.Series:
        return values.ge(_utc(self.start_utc)) & values.lt(_utc(self.end_utc))

    def overlaps(self, other: "TimeBlock") -> bool:
        return _utc(self.start_utc) < _utc(other.end_utc) and _utc(other.start_utc) < _utc(self.end_utc)


@dataclass(frozen=True)
class DevelopmentFold:
    fold_id: str
    train: TimeBlock
    early_stopping: TimeBlock
    evaluation: TimeBlock

    def __post_init__(self) -> None:
        if not self.fold_id.strip():
            raise ValueError("fold_id não pode ser vazio.")
        blocks = (self.train, self.early_stopping, self.evaluation)
        if any(left.overlaps(right) for index, left in enumerate(blocks) for right in blocks[index + 1:]):
            raise ValueError(f"Blocos do fold {self.fold_id} devem ser disjuntos.")
        if not (_utc(self.train.end_utc) <= _utc(self.early_stopping.start_utc)
                and _utc(self.early_stopping.end_utc) <= _utc(self.evaluation.start_utc)):
            raise ValueError("Ordem do fold deve ser treino, early stopping e avaliação.")


@dataclass(frozen=True)
class TemporalSupport:
    name: str
    reference: str
    consumed_start_offset_hours: float
    consumed_end_offset_hours: float
    available_after_hours: float
    horizon_hours: float
    label_duration_hours: float = 0
    transformation_lookback_hours: float = 0

    def __post_init__(self) -> None:
        if self.consumed_start_offset_hours > self.consumed_end_offset_hours:
            raise ValueError("Suporte temporal invertido.")
        if min(self.available_after_hours, self.horizon_hours, self.label_duration_hours,
               self.transformation_lookback_hours) < 0:
            raise ValueError("Disponibilidade, horizonte, duração e lookback devem ser não negativos.")


@dataclass(frozen=True)
class ProtocolManifest:
    protocol_version: str
    state: ProtocolState
    created_at_utc: str
    target_contract_sha256: str
    eligibility_policy_sha256: str
    snapshot_sha256: str
    catalog_sha256: str
    composition_sha256: str
    source_sha256: dict[str, str]
    folds: tuple[DevelopmentFold, ...]
    calibration: TimeBlock
    final_test: TimeBlock
    feature_support: tuple[TemporalSupport, ...]
    purge_hours: float
    purge_justification: str
    candidates: tuple[dict[str, Any], ...]
    candidate_budget: int
    selection_rule: dict[str, Any]
    final_training_rule: dict[str, Any]
    calibration_rule: dict[str, Any]
    acceptance_criteria: dict[str, Any]
    scientific_prerequisites: dict[str, bool] = field(default_factory=dict)
    generalization_policy: dict[str, Any] = field(default_factory=lambda: {
        "unit": "ons_set",
        "unseen_strategy": "physical_fallback",
        "spatial_evaluation": False,
    })
    reproducibility: dict[str, Any] = field(default_factory=dict)
    target_name: str = "geracao_referencia_mw"
    exposed_periods: tuple[dict[str, Any], ...] = ()
    minimums: dict[str, float] = field(default_factory=lambda: {
        "hours_per_role": 1, "plants_per_role": 1, "coverage_fraction": 0,
    })
    selected_candidate_id: str | None = None
    assignments_sha256: str | None = None
    model_sha256: str | None = None
    calibration_sha256: str | None = None
    final_report_sha256: str | None = None
    access_log: tuple[dict[str, Any], ...] = ()
    artifact_schema_version: str = SCHEMA_VERSION

    def __post_init__(self) -> None:
        if self.artifact_schema_version != SCHEMA_VERSION:
            raise ValueError("Versão de protocolo incompatível.")
        if self.target_name != "geracao_referencia_mw":
            raise ValueError("O protocolo temporal aceita somente geracao_referencia_mw como target.")
        if not self.protocol_version.strip() or not self.folds or not self.candidates:
            raise ValueError("Protocolo precisa de versão, ao menos um fold e candidatos.")
        if not self.feature_support:
            raise ValueError("Protocolo precisa declarar o suporte temporal das features/rótulo.")
        if not self.source_sha256:
            raise ValueError("Protocolo precisa registrar ao menos uma fonte.")
        if len({fold.fold_id for fold in self.folds}) != len(self.folds):
            raise ValueError("fold_id duplicado.")
        candidate_ids = [item.get("candidate_id") for item in self.candidates]
        if any(not value for value in candidate_ids) or len(candidate_ids) != len(set(candidate_ids)):
            raise ValueError("Candidatos exigem candidate_id único.")
        created = _utc(self.created_at_utc)
        object.__setattr__(self, "created_at_utc", created.isoformat())
        hashes = [self.target_contract_sha256, self.eligibility_policy_sha256,
                  self.snapshot_sha256, self.catalog_sha256, self.composition_sha256,
                  *self.source_sha256.values()]
        hashes.extend(value for value in (self.assignments_sha256, self.model_sha256,
                                          self.calibration_sha256, self.final_report_sha256) if value is not None)
        if any(not isinstance(value, str) or len(value) != 64
               or any(c not in "0123456789abcdef" for c in value) for value in hashes):
            raise ValueError("Hashes do protocolo devem ser SHA-256 hexadecimais.")
        reserved = (self.calibration, self.final_test)
        if self.calibration.overlaps(self.final_test):
            raise ValueError("Calibração e teste final devem ser disjuntos.")
        for fold in self.folds:
            if any(block.overlaps(reserve) for block in (fold.train, fold.early_stopping, fold.evaluation)
                   for reserve in reserved):
                raise ValueError("Folds de desenvolvimento não podem tocar reservas.")
            first_gap = (_utc(fold.early_stopping.start_utc) - _utc(fold.train.end_utc)).total_seconds() / 3600
            second_gap = (_utc(fold.evaluation.start_utc) - _utc(fold.early_stopping.end_utc)).total_seconds() / 3600
            if min(first_gap, second_gap) < self.purge_hours:
                raise ValueError("Intervalos não respeitam a purga declarada.")
        if max(_utc(fold.evaluation.end_utc) for fold in self.folds) > _utc(self.calibration.start_utc):
            raise ValueError("Calibração deve ocorrer depois do desenvolvimento.")
        if _utc(self.calibration.end_utc) > _utc(self.final_test.start_utc):
            raise ValueError("Teste final deve ocorrer depois da calibração.")
        required_purge = max((max(0.0, -item.consumed_start_offset_hours,
                                  item.consumed_end_offset_hours, item.available_after_hours,
                                  item.horizon_hours + item.label_duration_hours,
                                  item.transformation_lookback_hours)
                              for item in self.feature_support), default=0.0)
        if self.purge_hours < required_purge:
            raise ValueError("Purga menor que o suporte temporal declarado.")
        if self.candidate_budget < 1 or len(self.candidates) > self.candidate_budget:
            raise ValueError("Orçamento de candidatos inválido.")
        if set(self.minimums) != {"hours_per_role", "plants_per_role", "coverage_fraction"}:
            raise ValueError("Mínimos do protocolo incompletos ou desconhecidos.")
        if (type(self.minimums["hours_per_role"]) is not int or self.minimums["hours_per_role"] < 1
                or type(self.minimums["plants_per_role"]) is not int or self.minimums["plants_per_role"] < 1
                or not 0 <= self.minimums["coverage_fraction"] <= 1):
            raise ValueError("Mínimos de horas, usinas ou cobertura inválidos.")
        if self.selection_rule.get("primary_metric") not in {"mae_mw", "rmse_mw", "nmae_cf"}:
            raise ValueError("Métrica primária não suportada pelo protocolo v1.")
        if (self.selection_rule.get("aggregation") != "mean"
                or self.selection_rule.get("tie_break") != "candidate_id"):
            raise ValueError("Protocolo v1 exige agregação mean e desempate por candidate_id.")
        if self.final_training_rule.get("method") != "median_best_iteration":
            raise ValueError("Regra de treino final não suportada.")
        if (int(self.final_training_rule.get("min_iterations", 1)) < 1
                or int(self.final_training_rule.get("max_iterations", 1))
                < int(self.final_training_rule.get("min_iterations", 1))):
            raise ValueError("Limites de iterações inválidos.")
        if self.purge_hours < 0 or not self.purge_justification.strip():
            raise ValueError("Purga exige valor não negativo e justificativa.")
        for exposed in self.exposed_periods:
            if not {"start_utc", "end_utc", "reason"} <= set(exposed) or not str(exposed["reason"]).strip():
                raise ValueError("Período exposto exige limites UTC e motivo.")
            block = TimeBlock(exposed["start_utc"], exposed["end_utc"])
            if self.state not in (ProtocolState.INFRASTRUCTURE_TEST, ProtocolState.EXPLORATORY) \
                    and block.overlaps(self.final_test):
                raise ValueError("Teste final científico não pode reutilizar período já exposto.")
        if self.state not in (ProtocolState.INFRASTRUCTURE_TEST, ProtocolState.EXPLORATORY):
            required = (self.target_contract_sha256, self.eligibility_policy_sha256,
                        self.snapshot_sha256, self.catalog_sha256, self.composition_sha256)
            if any(value == "0" * 64 for value in required):
                raise ValueError("Protocolo científico não aceita hashes placeholder.")
            if set(self.scientific_prerequisites) != SCIENTIFIC_PREREQUISITES:
                raise ValueError("Pré-condições científicas incompletas ou desconhecidas.")
            if any(type(value) is not bool for value in self.scientific_prerequisites.values()):
                raise ValueError("Pré-condições científicas devem ser booleanas.")
            if not all(self.scientific_prerequisites.values()):
                pending = sorted(name for name, approved in self.scientific_prerequisites.items()
                                 if not approved)
                raise ValueError(f"Pré-condições científicas pendentes: {pending}.")
            if not self.acceptance_criteria:
                raise ValueError("Protocolo científico exige critérios de aceite pré-declarados.")
            required_reproducibility = {
                "random_seed", "n_jobs", "training_config_sha256", "runtime_constraints_sha256",
            }
            if set(self.reproducibility) != required_reproducibility:
                raise ValueError("Contrato de reprodutibilidade incompleto ou desconhecido.")
            if (type(self.reproducibility["random_seed"]) is not int
                    or type(self.reproducibility["n_jobs"]) is not int
                    or self.reproducibility["n_jobs"] == 0):
                raise ValueError("Seed e paralelismo do protocolo são inválidos.")
            for name in ("training_config_sha256", "runtime_constraints_sha256"):
                value = self.reproducibility[name]
                if not isinstance(value, str) or len(value) != 64 \
                        or any(c not in "0123456789abcdef" for c in value):
                    raise ValueError(f"{name} deve ser SHA-256 hexadecimal.")
        expected_generalization = {"unit", "unseen_strategy", "spatial_evaluation"}
        if set(self.generalization_policy) != expected_generalization:
            raise ValueError("Política de generalização incompleta ou desconhecida.")
        if self.generalization_policy["unit"] not in {"ons_set", "ceg", "park", "complex", "region"}:
            raise ValueError("Unidade de generalização desconhecida.")
        if self.generalization_policy["unseen_strategy"] not in {"physical_fallback", "evaluate_spatially"}:
            raise ValueError("Estratégia para grupos não vistos desconhecida.")
        spatial = self.generalization_policy["spatial_evaluation"]
        if type(spatial) is not bool:
            raise ValueError("spatial_evaluation deve ser booleano.")
        if spatial != (self.generalization_policy["unseen_strategy"] == "evaluate_spatially"):
            raise ValueError("Avaliação espacial e estratégia para não vistos são inconsistentes.")
        if spatial and self.state not in (ProtocolState.INFRASTRUCTURE_TEST, ProtocolState.EXPLORATORY):
            raise ValueError("Protocolo espacial científico ainda não foi implementado; use fallback físico.")

    @classmethod
    def from_dict(cls, values: dict[str, Any]) -> "ProtocolManifest":
        data = dict(values)
        data["state"] = ProtocolState(data["state"])
        data["folds"] = tuple(DevelopmentFold(
            fold_id=item["fold_id"],
            train=TimeBlock(**item["train"]),
            early_stopping=TimeBlock(**item["early_stopping"]),
            evaluation=TimeBlock(**item["evaluation"]),
        ) for item in data["folds"])
        data["calibration"] = TimeBlock(**data["calibration"])
        data["final_test"] = TimeBlock(**data["final_test"])
        data["feature_support"] = tuple(TemporalSupport(**item) for item in data["feature_support"])
        for name in ("candidates", "exposed_periods", "access_log"):
            data[name] = tuple(data.get(name, ()))
        return cls(**data)

    @classmethod
    def load(cls, path: Path) -> "ProtocolManifest":
        return cls.from_dict(json.loads(path.read_text(encoding="utf-8")))

    def serializable(self) -> dict[str, Any]:
        value = asdict(self)
        value["state"] = self.state.value
        return value

    def digest(self) -> str:
        return sha256_json(self.serializable())

    def validate_feature_contract(self, *, required_history_hours: int,
                                  most_required: bool) -> None:
        """Bind runtime feature semantics to the frozen temporal manifest."""
        if required_history_hours:
            matching = [item for item in self.feature_support
                        if item.consumed_start_offset_hours <= -required_history_hours
                        and item.consumed_end_offset_hours >= 0]
            if not matching:
                raise ValueError(
                    f"Manifesto não declara o lookback causal de {required_history_hours} horas."
                )
        if most_required and not any("most" in item.name.lower() or "monin" in item.name.lower()
                                     for item in self.feature_support):
            raise ValueError("Manifesto não declara suporte temporal/proveniência das entradas MOST.")

    def validate_reproducibility(self, *, training_config: dict[str, Any]) -> None:
        """Ensure a frozen protocol cannot be run with a different seed/config."""
        if self.state in (ProtocolState.INFRASTRUCTURE_TEST, ProtocolState.EXPLORATORY):
            return
        if sha256_json(training_config) != self.reproducibility["training_config_sha256"]:
            raise ValueError("Configuração de treino diverge do hash congelado no protocolo.")
        if training_config.get("random_state") != self.reproducibility["random_seed"]:
            raise ValueError("Seed de treino diverge do protocolo.")
        if training_config.get("n_jobs") != self.reproducibility["n_jobs"]:
            raise ValueError("Paralelismo de treino diverge do protocolo.")

    def transition(self, state: ProtocolState, **evidence: str | None) -> "ProtocolManifest":
        if state not in _TRANSITIONS[self.state]:
            raise ValueError(f"Transição inválida: {self.state.value} -> {state.value}.")
        updated = replace(self, state=state, **evidence)
        requirements = {
            ProtocolState.MODEL_FROZEN: (updated.assignments_sha256, updated.selected_candidate_id, updated.model_sha256),
            ProtocolState.CALIBRATION_FROZEN: (updated.model_sha256, updated.calibration_sha256),
            ProtocolState.FINAL_TEST_CONSUMED: (updated.model_sha256, updated.calibration_sha256, updated.final_report_sha256),
            ProtocolState.OPERATIONALLY_HOMOLOGATED: (updated.final_report_sha256,),
        }
        if state in requirements and any(not value for value in requirements[state]):
            raise ValueError(f"Evidência obrigatória ausente para {state.value}.")
        if updated.selected_candidate_id and updated.selected_candidate_id not in {
                item["candidate_id"] for item in updated.candidates}:
            raise ValueError("Candidato selecionado não pertence ao protocolo.")
        return updated

    def with_access(self, role: str, *, actor: str, purpose: str) -> "ProtocolManifest":
        if role not in {"calibration", "final_test"}:
            raise ValueError("Somente acessos a blocos reservados são registrados aqui.")
        if role == "calibration" and self.state != ProtocolState.MODEL_FROZEN:
            raise ValueError("Calibração só pode ser aberta após congelar o modelo.")
        if role == "final_test" and self.state != ProtocolState.CALIBRATION_FROZEN:
            raise ValueError("Teste final só pode ser aberto após congelar a calibração.")
        if not actor.strip() or not purpose.strip():
            raise ValueError("Acesso reservado exige ator e finalidade.")
        entry = {"role": role, "actor": actor, "purpose": purpose,
                 "accessed_at_utc": datetime.now(timezone.utc).isoformat()}
        return replace(self, access_log=(*self.access_log, entry))

    def write(self, path: Path) -> None:
        if path.exists():
            raise FileExistsError("Manifesto é imutável; escreva uma nova versão.")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(canonical_bytes(self.serializable()) + b"\n")


def validate_expanding_folds(folds: Iterable[DevelopmentFold]) -> None:
    previous: DevelopmentFold | None = None
    for fold in folds:
        if previous and (_utc(fold.train.start_utc) != _utc(previous.train.start_utc)
                         or _utc(fold.train.end_utc) < _utc(previous.evaluation.end_utc)):
            raise ValueError("Folds devem ter treino expansivo e incorporar a avaliação anterior.")
        previous = fold
