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

    def __post_init__(self) -> None:
        if self.consumed_start_offset_hours > self.consumed_end_offset_hours:
            raise ValueError("Suporte temporal invertido.")


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
        if not self.protocol_version.strip() or not self.folds:
            raise ValueError("Protocolo precisa de versão e ao menos um fold.")
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
        if any(len(value) != 64 or any(c not in "0123456789abcdef" for c in value) for value in hashes):
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
                                  item.consumed_end_offset_hours, item.available_after_hours)
                              for item in self.feature_support), default=0.0)
        if self.purge_hours < required_purge:
            raise ValueError("Purga menor que o suporte temporal declarado.")
        if self.candidate_budget < 1 or len(self.candidates) > self.candidate_budget:
            raise ValueError("Orçamento de candidatos inválido.")
        if self.purge_hours < 0 or not self.purge_justification.strip():
            raise ValueError("Purga exige valor não negativo e justificativa.")
        if self.state not in (ProtocolState.INFRASTRUCTURE_TEST, ProtocolState.EXPLORATORY):
            required = (self.target_contract_sha256, self.eligibility_policy_sha256,
                        self.snapshot_sha256, self.catalog_sha256, self.composition_sha256)
            if any(value == "0" * 64 for value in required):
                raise ValueError("Protocolo científico não aceita hashes placeholder.")

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
        return updated

    def with_access(self, role: str, *, actor: str, purpose: str) -> "ProtocolManifest":
        if role not in {"calibration", "final_test"}:
            raise ValueError("Somente acessos a blocos reservados são registrados aqui.")
        if role == "calibration" and self.state != ProtocolState.MODEL_FROZEN:
            raise ValueError("Calibração só pode ser aberta após congelar o modelo.")
        if role == "final_test" and self.state != ProtocolState.CALIBRATION_FROZEN:
            raise ValueError("Teste final só pode ser aberto após congelar a calibração.")
        entry = {"role": role, "actor": actor, "purpose": purpose,
                 "accessed_at_utc": datetime.now(timezone.utc).isoformat()}
        return replace(self, access_log=(*self.access_log, entry))

    def write(self, path: Path, *, overwrite: bool = False) -> None:
        if path.exists() and not overwrite:
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
