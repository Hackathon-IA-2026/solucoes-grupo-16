"""Common residual-estimator interface for protocol candidates."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import numpy as np
import pandas as pd


class ResidualEstimator(Protocol):
    algorithm: str
    best_iteration: int
    def fit(self, train_x: pd.DataFrame, train_y: pd.Series,
            stopping_x: pd.DataFrame, stopping_y: pd.Series) -> None: ...
    def predict(self, features: pd.DataFrame) -> np.ndarray: ...
    def save(self, path: Path) -> None: ...


@dataclass
class LightGBMEstimator:
    parameters: dict[str, Any]
    algorithm: str = "lightgbm"

    def __post_init__(self) -> None:
        import lightgbm as lgb
        self._lgb = lgb
        self.model = lgb.LGBMRegressor(**self.parameters)
        self.best_iteration = 0

    def fit(self, train_x, train_y, stopping_x, stopping_y) -> None:
        self.model.fit(train_x, train_y, eval_set=[(stopping_x, stopping_y)], eval_metric="mae",
                       callbacks=[self._lgb.early_stopping(100, verbose=False)])
        self.best_iteration = int(self.model.best_iteration_ or self.parameters.get("n_estimators", 1))

    def predict(self, features) -> np.ndarray:
        return np.asarray(self.model.predict(features))

    def save(self, path: Path) -> None:
        self.model.booster_.save_model(str(path))


@dataclass
class XGBoostEstimator:
    parameters: dict[str, Any]
    algorithm: str = "xgboost"

    def __post_init__(self) -> None:
        try:
            import xgboost as xgb
        except ImportError as exc:
            raise RuntimeError("Candidato XGBoost exige a dependência opcional xgboost.") from exc
        self.model = xgb.XGBRegressor(**self.parameters)
        self.best_iteration = 0

    def fit(self, train_x, train_y, stopping_x, stopping_y) -> None:
        self.model.fit(train_x, train_y, eval_set=[(stopping_x, stopping_y)], verbose=False)
        value = getattr(self.model, "best_iteration", None)
        self.best_iteration = int(value + 1 if value is not None else self.parameters.get("n_estimators", 1))

    def predict(self, features) -> np.ndarray:
        return np.asarray(self.model.predict(features))

    def save(self, path: Path) -> None:
        self.model.save_model(str(path))


def create_estimator(candidate: dict[str, Any], *, random_state: int = 42, n_jobs: int = 1) -> ResidualEstimator:
    algorithm = candidate.get("algorithm")
    parameters = dict(candidate.get("parameters", {}))
    parameters.setdefault("random_state", random_state)
    parameters.setdefault("n_jobs", n_jobs)
    if algorithm == "lightgbm":
        parameters.setdefault("objective", "regression_l1")
        parameters.update({"deterministic": True, "force_col_wise": True, "verbosity": -1})
        return LightGBMEstimator(parameters)
    if algorithm == "xgboost":
        parameters.setdefault("objective", "reg:absoluteerror")
        parameters.setdefault("tree_method", "hist")
        parameters.setdefault("early_stopping_rounds", 100)
        return XGBoostEstimator(parameters)
    raise ValueError(f"Algoritmo não autorizado: {algorithm!r}.")
