import pandas as pd
import pytest

from training.causal.verified_generation_audit import (
    assemble_verified_frame,
    run_verified_generation_audit,
)


def _predictions() -> pd.DataFrame:
    rows = []
    for month in pd.period_range("2024-10", periods=12, freq="M"):
        timestamp = month.start_time.tz_localize("UTC")
        rows.append({
            "evaluation_month": str(month),
            "timestamp_utc": timestamp,
            "usina_id": "A",
            "target_mw": 100.0,
            "capacidade_instalada_mw": 200.0,
            "baseline_mw": 50.0,
            "lightgbm_aug_mw": 90.0,
            "dml_aug_mw": 80.0,
            "lightgbm_aug_sep_scalar_mw": 95.0,
        })
    return pd.DataFrame(rows)


def _months() -> list[tuple[str, pd.DataFrame]]:
    frames = []
    for month in pd.period_range("2024-10", periods=12, freq="M"):
        frames.append((str(month), pd.DataFrame({
            "timestamp_utc": [month.start_time.tz_localize("UTC")],
            "usina_id": ["A"],
            "geracao_referencia_mw": [100.0],
            "geracao_verificada_mw": [80.0],
        })))
    return frames


def test_audit_keeps_frozen_predictions_and_switches_only_evaluation_target():
    report, predictions, summary = run_verified_generation_audit(
        _predictions(), _months()
    )

    assert report["predictions_refit_or_reselected"] is False
    assert report["coverage"]["missing_verified_generation_rows"] == 0
    assert predictions["reference_target_mw"].eq(100.0).all()
    assert predictions["geracao_verificada_mw"].eq(80.0).all()
    candidate = report["verified_target_metrics"][
        "lightgbm_aug_plus_sep_scalar"
    ]["hourly_grid_total"]
    assert candidate["wape"] == pytest.approx(0.1875)
    assert candidate["signed_total_error_fraction"] == pytest.approx(0.1875)
    assert summary["best_counterfactual_model_by_hourly_wape"] == "dml_aug"
    assert report["ons_reference_verified_gap"][
        "reference_minus_verified_fraction_of_reference"
    ] == pytest.approx(0.20)


def test_audit_rejects_incomplete_key_coverage():
    predictions = _predictions().iloc[:-1].copy()

    with pytest.raises(ValueError, match="Meses das predições|Cobertura"):
        assemble_verified_frame(predictions, _months())


def test_audit_rejects_changed_reference_target():
    predictions = _predictions()
    months = _months()
    months[0][1].loc[0, "geracao_referencia_mw"] = 101.0

    with pytest.raises(ValueError, match="referência do snapshot diverge"):
        assemble_verified_frame(predictions, months)
