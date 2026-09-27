"""Forward-only cross-fitting for an irregular plant-by-hour panel."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class TemporalCrossfitFold:
    fold_id: str
    train_indices: np.ndarray
    evaluation_indices: np.ndarray
    train_start_utc: str
    train_end_utc: str
    evaluation_start_utc: str
    evaluation_end_utc: str


def expanding_time_splits(
    timestamps: pd.Series,
    *,
    n_splits: int,
    gap_hours: int = 0,
) -> tuple[TemporalCrossfitFold, ...]:
    """Return a warm-up block followed by forward-only evaluation blocks.

    Splits are made over unique UTC timestamps and then expanded to row indices,
    so every plant observed in the same hour receives the same role.
    """
    values = pd.to_datetime(timestamps, utc=True, errors="coerce")
    if values.isna().any():
        raise ValueError("Cross-fitting causal exige timestamps UTC válidos.")
    if n_splits < 2 or gap_hours < 0:
        raise ValueError("Cross-fitting exige ao menos dois folds e gap não negativo.")
    unique_times = pd.DatetimeIndex(values.unique()).sort_values()
    if len(unique_times) < n_splits + 1:
        raise ValueError("Horas insuficientes para warm-up e folds causais.")
    blocks = [pd.DatetimeIndex(block) for block in np.array_split(unique_times, n_splits + 1)]
    if any(len(block) == 0 for block in blocks):
        raise ValueError("Fold causal vazio.")

    folds: list[TemporalCrossfitFold] = []
    for index in range(1, len(blocks)):
        evaluation_times = blocks[index]
        cutoff = evaluation_times.min() - timedelta(hours=gap_hours)
        train_times = unique_times[unique_times < cutoff] if gap_hours else unique_times[unique_times < evaluation_times.min()]
        if train_times.empty:
            raise ValueError("Gap causal removeu todo o histórico de treino.")
        train_mask = values.isin(train_times).to_numpy()
        evaluation_mask = values.isin(evaluation_times).to_numpy()
        train_indices = np.flatnonzero(train_mask)
        evaluation_indices = np.flatnonzero(evaluation_mask)
        if not len(train_indices) or not len(evaluation_indices):
            raise ValueError("Fold causal sem linhas de treino ou avaliação.")
        folds.append(TemporalCrossfitFold(
            fold_id=f"causal-{index:02d}",
            train_indices=train_indices,
            evaluation_indices=evaluation_indices,
            train_start_utc=train_times.min().isoformat(),
            train_end_utc=train_times.max().isoformat(),
            evaluation_start_utc=evaluation_times.min().isoformat(),
            evaluation_end_utc=evaluation_times.max().isoformat(),
        ))
    return tuple(folds)
