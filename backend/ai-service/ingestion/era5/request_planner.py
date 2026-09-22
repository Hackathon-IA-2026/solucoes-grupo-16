"""Deterministic monthly request planning for the CDS API."""
from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from typing import Iterator

from ingestion.common.io import stable_hash
from ingestion.plants.catalog import SpatialBounds
from ingestion.era5.config import ERA5_DATASET, ERA5_VARIABLES


@dataclass(frozen=True)
class MonthlyRequest:
    year: int
    month: int
    dataset: str
    payload: dict
    request_hash: str
    expected_hours: int

    @property
    def label(self) -> str:
        return f"{self.year:04d}-{self.month:02d}"


def iter_months(start: date, end: date) -> Iterator[tuple[int, int]]:
    if end < start:
        raise ValueError("A data final deve ser igual ou posterior à data inicial.")
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        yield year, month
        if month == 12:
            year, month = year + 1, 1
        else:
            month += 1


def build_monthly_request(year: int, month: int, bounds: SpatialBounds) -> MonthlyRequest:
    days_in_month = calendar.monthrange(year, month)[1]
    payload = {
        "product_type": ["reanalysis"],
        "variable": list(ERA5_VARIABLES),
        "year": [f"{year:04d}"],
        "month": [f"{month:02d}"],
        "day": [f"{day:02d}" for day in range(1, days_in_month + 1)],
        "time": [f"{hour:02d}:00" for hour in range(24)],
        "data_format": "netcdf",
        "download_format": "unarchived",
        "area": bounds.as_cds_area(),
    }
    identity = {"dataset": ERA5_DATASET, "payload": payload}
    return MonthlyRequest(
        year=year,
        month=month,
        dataset=ERA5_DATASET,
        payload=payload,
        request_hash=stable_hash(identity),
        expected_hours=days_in_month * 24,
    )


def plan_requests(start: date, end: date, bounds: SpatialBounds) -> list[MonthlyRequest]:
    return [build_monthly_request(year, month, bounds) for year, month in iter_months(start, end)]

