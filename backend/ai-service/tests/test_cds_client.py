from pathlib import Path

import numpy as np
import xarray as xr

from ingestion.era5.cds_client import download_month
from ingestion.era5.request_planner import build_monthly_request
from ingestion.plants.catalog import SpatialBounds


def test_download_is_atomic_manifested_and_idempotent(tmp_path: Path):
    request = build_monthly_request(
        2024,
        1,
        SpatialBounds(north=0.0, west=-46.0, south=-16.0, east=-34.0),
    )
    output = tmp_path / "month.nc"
    manifest = tmp_path / "month.json"
    calls = []

    def fake_retrieve(dataset, payload, target):
        calls.append((dataset, payload))
        shape = (1, 1, 1)
        values = np.ones(shape)
        xr.Dataset(
            {
                "u100": (("time", "latitude", "longitude"), values),
                "v100": (("time", "latitude", "longitude"), values),
                "t2m": (("time", "latitude", "longitude"), values * 290),
                "sp": (("time", "latitude", "longitude"), values * 100000),
            },
            coords={"time": ["2024-01-01T00:00:00"], "latitude": [-5.0], "longitude": [-36.0]},
        ).to_netcdf(target, engine="netcdf4")

    first = download_month(request, output, manifest, retrieve=fake_retrieve)
    second = download_month(request, output, manifest, retrieve=fake_retrieve)
    assert first["status"] == "completed"
    assert second["status"] == "skipped"
    assert output.exists()
    assert not output.with_suffix(".nc.part").exists()
    assert len(calls) == 1

