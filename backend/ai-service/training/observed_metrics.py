"""Paired evaluation against observed ONS power and the reference proxy."""
from __future__ import annotations

import numpy as np
import pandas as pd

from ingestion.ons.observed import KEYS, OBSERVED, REFERENCE, cohort, keyed


def metrics(actual: pd.Series, predicted: pd.Series) -> dict:
    y, p = actual.to_numpy(dtype=float), predicted.to_numpy(dtype=float)
    if not len(y):
        return {"rows": 0}
    error = p - y
    absolute = np.abs(error)
    denominator = np.abs(y).sum()
    nonzero = y != 0
    ape = absolute[nonzero] / np.abs(y[nonzero])
    variance = np.sum((y - y.mean()) ** 2)
    result = {
        "rows": len(y), "mae_mw": float(absolute.mean()),
        "rmse_mw": float(np.sqrt(np.mean(error ** 2))),
        "bias_mw": float(error.mean()),
        "wape": float(absolute.sum() / denominator) if denominator else None,
        "r2": float(1 - np.sum(error ** 2) / variance) if len(y) > 1 and variance else None,
        "pearson_r": float(np.corrcoef(y, p)[0, 1]) if len(y) > 1 and y.std() and p.std() else None,
        "target_total_mwh": float(y.sum()), "prediction_total_mwh": float(p.sum()),
        "signed_total_difference_mwh": float(error.sum()),
        "signed_total_error_fraction": float(error.sum() / y.sum()) if y.sum() else None,
        "mape_nonzero": float(ape.mean()) if len(ape) else None,
        "zero_target_rows_excluded_from_percentage_metrics": int((~nonzero).sum()),
    }
    for q in (50, 90, 95, 99):
        result[f"p{q}_abs_error_mw"] = float(np.percentile(absolute, q))
        result[f"p{q}_absolute_percentage_error"] = float(np.percentile(ape, q)) if len(ape) else None
    return result


def score(frame: pd.DataFrame, target: str, columns: list[str]) -> dict:
    hourly = frame.groupby("timestamp_utc")[[target, *columns]].sum()
    return {
        "target": target, "cohort": cohort(frame),
        "models": {column: {
            "plant_hour": metrics(frame[target], frame[column]),
            "hourly_grid_total": metrics(hourly[target], hourly[column]),
        } for column in columns},
    }


def evaluate_observed(
    predictions: pd.DataFrame, snapshot: pd.DataFrame, columns: list[str],
) -> tuple[pd.DataFrame, dict]:
    if not columns or len(columns) != len(set(columns)):
        raise ValueError("Informe colunas de previsão únicas e explícitas.")
    if set(columns) & (set(KEYS) | {OBSERVED, REFERENCE, "target_mw"}):
        raise ValueError("Target/chave não pode ser usado como previsão.")
    predictions = keyed(predictions, "previsões")
    snapshot = keyed(snapshot, "snapshot")
    if set(columns) - set(predictions):
        raise ValueError(f"Previsões ausentes: {sorted(set(columns) - set(predictions))}")
    if {OBSERVED, REFERENCE} - set(snapshot):
        raise ValueError("Snapshot deve conter geração verificada e referência separadas.")
    # Targets possibly embedded in the prediction file are deliberately ignored.
    prediction_frame = predictions[KEYS + columns].copy()
    joined = prediction_frame.merge(snapshot.drop(columns=columns, errors="ignore"),
                                    on=KEYS, how="inner", validate="one_to_one")
    numeric = [OBSERVED, REFERENCE, *columns]
    for col in numeric:
        joined[col] = pd.to_numeric(joined[col], errors="coerce")
    reasons = {f"nonfinite_{col}": ~np.isfinite(joined[col]) for col in numeric}
    reasons.update({f"negative_{col}": joined[col].lt(0) for col in (OBSERVED, REFERENCE)})
    invalid = pd.DataFrame(reasons).any(axis=1)
    paired = joined.loc[~invalid].copy()
    if paired.empty:
        raise ValueError("Nenhuma previsão pareada com os dois alvos finitos.")
    paired = keyed(paired, "comparação")
    group_month = paired.timestamp_utc.dt.tz_convert("America/Sao_Paulo").dt.strftime("%Y-%m")
    report = {
        "schema_version": "climagrid-observed-generation-evaluation-v1",
        "status": "exploratory_paired_observed_evaluation", "scientifically_approved": False,
        "primary_target": OBSERVED, "secondary_target": REFERENCE,
        "primary_metric": "hourly_grid_total.wape",
        "prediction_columns": columns, "cohort": cohort(paired),
        "coverage": {
            "predictions_supplied": len(predictions), "snapshot_rows": len(snapshot),
            "joined_rows": len(joined), "unmatched_prediction_rows": len(predictions) - len(joined),
            "snapshot_rows_without_prediction": len(snapshot) - len(joined),
            "invalid_paired_rows": int(invalid.sum()), "paired_rows": len(paired),
            "paired_prediction_fraction": len(paired) / len(predictions),
            "invalid_reasons_overlap": {reason: int(mask.sum()) for reason, mask in reasons.items()},
            "target_magnitude_filtering": False,
        },
        "metrics": {target: score(paired, target, columns) for target in (OBSERVED, REFERENCE)},
        "monthly": {month: {target: score(group, target, columns) for target in (OBSERVED, REFERENCE)}
                    for month, group in paired.groupby(group_month)},
        "by_plant": {plant: {target: score(group, target, columns) for target in (OBSERVED, REFERENCE)}
                     for plant, group in paired.groupby("usina_id")},
        "reference_vs_observed": metrics(paired[OBSERVED], paired[REFERENCE]),
        "percentage_policy": "Zero targets remain in WAPE/MAE/energy; excluded only from individual percentage metrics.",
        "energy_policy": "MW hourly mean times one hour, summed only over the explicitly paired population.",
        "limitations": [
            "Modelo congelado; nenhum treino ou seleção usando estes resultados.",
            "ERA5 é reanálise histórica; não mede erro de previsão meteorológica futura.",
            "Referência é proxy de potencial; diferenças não identificam causalmente curtailment.",
            "Total horário refere-se apenas aos conjuntos pareados, não a toda a rede NE.",
            "Nenhuma convergência elétrica foi validada no ANAREDE.",
        ],
    }
    if "restriction_recorded" in paired:
        flag = paired.restriction_recorded.astype("boolean")
        report["restriction_sensitivity"] = {
            label: {target: score(paired.loc[mask], target, columns) for target in (OBSERVED, REFERENCE)}
            for label, mask in {
                "recorded": flag.fillna(False), "not_recorded": (~flag).fillna(False),
                "unknown": flag.isna(),
            }.items()
        }
    return paired, report


def render_report(report: dict) -> str:
    lines = ["# Modelo versus geração verificada ONS", "",
             "Avaliação exploratória com ERA5 histórico; modelo congelado.", "",
             f"Coorte pareada: {report['cohort']['rows']} linhas, {report['cohort']['hours']} horas, "
             f"{report['cohort']['plants']} conjuntos. Hash: `{report['cohort']['keys_sha256']}`.", "",
             "Os dois placares usam exatamente as mesmas chaves e previsões.", "",
             "| Alvo | Previsão | WAPE horário | MAE horário (MW) | WAPE conjunto-hora |",
             "| --- | --- | ---: | ---: | ---: |"]
    def percentage(value):
        return "indefinido" if value is None else f"{100 * value:.2f}%"
    for target, result in report["metrics"].items():
        for column, scores in result["models"].items():
            hourly = scores["hourly_grid_total"]
            lines.append(f"| {target} | {column} | {percentage(hourly['wape'])} | "
                         f"{hourly['mae_mw']:.3f} | {percentage(scores['plant_hour']['wape'])} |")
    lines += ["", f"Cobertura das previsões: {percentage(report['coverage']['paired_prediction_fraction'])}.",
              "Métricas mensais, por conjunto, percentis, energia e sensibilidade constam no JSON.", ""]
    lines += [f"- {item}" for item in report["limitations"]]
    return "\n".join(lines) + "\n"
