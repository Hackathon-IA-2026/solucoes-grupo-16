"""ERA5 ingestion configuration."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from training.config import service_root


ERA5_DATASET = "reanalysis-era5-single-levels"
ERA5_VARIABLES = (
    "100m_u_component_of_wind",
    "100m_v_component_of_wind",
    "2m_temperature",
    "surface_pressure",
)


@dataclass(frozen=True)
class ERA5Paths:
    root: Path = service_root() / "data"

    def raw_month(self, year: int, month: int) -> Path:
        return self.root / "raw" / "era5" / f"dataset={ERA5_DATASET}" / f"year={year:04d}" / f"month={month:02d}" / f"era5_ne_{year:04d}-{month:02d}.nc"

    def weather_month(self, year: int, month: int) -> Path:
        return self.root / "processed" / "era5" / f"year={year:04d}" / f"month={month:02d}" / "weather_hourly.parquet"

    def raw_manifest(self, year: int, month: int) -> Path:
        return self.root / "manifests" / "era5" / f"year={year:04d}" / f"month={month:02d}" / "download.json"

    def processed_manifest(self, year: int, month: int) -> Path:
        return self.root / "manifests" / "era5" / f"year={year:04d}" / f"month={month:02d}" / "processed.json"

