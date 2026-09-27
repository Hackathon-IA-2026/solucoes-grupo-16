import json
from pathlib import Path

import pandas as pd
import pytest

from training.config import TrainingConfig
from training.scientific_snapshot import (EXPECTED_POLICY, freeze_snapshot,
                                          validate_eligibility_policy)


def _json(path: Path, value: dict) -> Path:
    path.write_text(json.dumps(value), encoding="utf-8")
    return path


def test_snapshot_freeze_is_auditable_and_keeps_observed_generation_separate(
        synthetic_frame, tmp_path):
    raw = synthetic_frame.iloc[:48].copy()
    raw["geracao_verificada_mw"] = raw.geracao_referencia_mw - 1
    raw.loc[0, "geracao_referencia_mw"] = 101
    input_path = tmp_path / "joined.csv"
    raw.to_csv(input_path, index=False)
    catalog = _json(tmp_path / "catalog.json", {"version": 1})
    composition = _json(tmp_path / "composition.json", {"version": 1})
    contract = _json(tmp_path / "target.json", {
        "target_name": "geracao_referencia_mw", "approval_status": "pending_domain_review"})
    policy = _json(tmp_path / "policy.json", EXPECTED_POLICY)
    source = _json(tmp_path / "ons.json", {"source": "fixture"})
    validity = pd.DataFrame({
        "usina_id": ["test-001"], "valid_from_utc": ["2026-01-01T00:00:00Z"],
        "valid_to_utc": ["2026-02-01T00:00:00Z"],
    })
    output = tmp_path / "frozen.parquet"
    manifest_path = tmp_path / "snapshot-manifest.json"
    decisions = {name: False for name in (
        "target_contract_approved", "eligibility_policy_approved",
        "exposed_periods_inventory_complete", "historical_coverage_approved",
        "validity_and_composition_approved", "feature_availability_confirmed",
        "granularity_decided", "most_decided")}
    manifest = freeze_snapshot(
        raw, config=TrainingConfig(target="geracao_referencia_mw"), input_path=input_path,
        output_snapshot=output, output_manifest=manifest_path,
        target_contract_path=contract, eligibility_policy_path=policy,
        catalog_path=catalog, composition_path=composition, source_paths={"ons": source},
        decisions=decisions, validity=validity,
        exposed_periods=[{"start_utc": "2024-08-01T03:00:00Z",
                          "end_utc": "2024-09-01T03:00:00Z", "reason": "piloto exposto"}],
    )
    frozen = pd.read_parquet(output)
    assert manifest["scientific_status"] == "blocked"
    assert manifest["target_clipped"] is False
    assert manifest["quality_report"]["target_above_installed_capacity"] == 1
    assert len(frozen) == 47
    assert "geracao_verificada_mw" in frozen
    assert manifest["observed_generation_role"] == "audit_only_not_feature_not_target"
    assert manifest["inventory"]["by_month"][0]["rows"] == 47
    assert manifest_path.exists()
    with pytest.raises(FileExistsError, match="imutáveis"):
        freeze_snapshot(
            raw, config=TrainingConfig(target="geracao_referencia_mw"), input_path=input_path,
            output_snapshot=output, output_manifest=manifest_path,
            target_contract_path=contract, eligibility_policy_path=policy,
            catalog_path=catalog, composition_path=composition, source_paths={"ons": source},
            decisions=decisions, validity=validity)


def test_snapshot_policy_must_match_implemented_treatment():
    changed = {**EXPECTED_POLICY, "above_installed_capacity": "retain_and_flag"}
    with pytest.raises(ValueError, match="comportamento implementado"):
        validate_eligibility_policy(changed)


def test_decision_cannot_claim_approval_over_a_pending_document(
        synthetic_frame, tmp_path):
    raw = synthetic_frame.iloc[:24]
    input_path = tmp_path / "input.csv"
    raw.to_csv(input_path, index=False)
    policy = _json(tmp_path / "policy.json", {**EXPECTED_POLICY,
                                               "approval_status": "pending_domain_review"})
    contract = _json(tmp_path / "target.json", {
        "target_name": "geracao_referencia_mw", "approval_status": "pending_domain_review"})
    dependency = _json(tmp_path / "dependency.json", {"fixture": True})
    decisions = {name: False for name in (
        "target_contract_approved", "eligibility_policy_approved",
        "exposed_periods_inventory_complete", "historical_coverage_approved",
        "validity_and_composition_approved", "feature_availability_confirmed",
        "granularity_decided", "most_decided")}
    decisions["target_contract_approved"] = True
    with pytest.raises(ValueError, match="approval_status=approved"):
        freeze_snapshot(
            raw, config=TrainingConfig(target="geracao_referencia_mw"), input_path=input_path,
            output_snapshot=tmp_path / "out.parquet", output_manifest=tmp_path / "out.json",
            target_contract_path=contract, eligibility_policy_path=policy,
            catalog_path=dependency, composition_path=dependency,
            source_paths={"fixture": dependency}, decisions=decisions)
