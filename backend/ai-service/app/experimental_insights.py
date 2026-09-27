"""Read-only access to the pitch-oriented DML report; never changes the served predictor."""
from __future__ import annotations

import json
import os
from pathlib import Path

from training.causal.hackathon import SCHEMA_VERSION
from training.causal.independent_holdout import SCHEMA_VERSION as HOLDOUT_SCHEMA_VERSION
from training.config import service_root


class ExperimentalInsightsService:
    def __init__(self, report_path: Path | None = None,
                 holdout_path: Path | None = None) -> None:
        configured = os.getenv("CLIMAGRID_DML_INSIGHTS_PATH")
        configured_holdout = os.getenv("CLIMAGRID_INDEPENDENT_HOLDOUT_PATH")
        self.report_path = report_path or (
            Path(configured) if configured
            else service_root() / "artifacts" / "causal" / "hackathon" / "insights.json"
        )
        self.holdout_path = holdout_path or (
            Path(configured_holdout) if configured_holdout
            else service_root() / "artifacts" / "causal" / "independent-holdout-2024-09"
            / "holdout_report.json"
        )

    def available(self) -> bool:
        return self.report_path.is_file()

    def read(self) -> dict:
        if not self.available():
            return {
                "available": False,
                "status": "not_materialized",
                "message": (
                    "O relatório DML exploratório ainda não foi materializado. "
                    "O fluxo operacional continua usando a curva física."
                ),
            }
        try:
            report = json.loads(self.report_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError("Relatório DML exploratório inválido.") from exc
        if report.get("schema_version") != SCHEMA_VERSION:
            raise ValueError("Versão do relatório DML exploratório incompatível.")
        if report.get("scientifically_approved") is not False:
            raise ValueError("Relatório de pitch não pode declarar aprovação científica.")
        holdout = None
        if self.holdout_path.is_file():
            try:
                holdout = json.loads(self.holdout_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise ValueError("Relatório de holdout independente inválido.") from exc
            if (holdout.get("schema_version") != HOLDOUT_SCHEMA_VERSION
                    or holdout.get("scientifically_approved") is not False):
                raise ValueError("Contrato do holdout independente incompatível.")
        return {"available": True, **report, "independent_holdout": holdout}
