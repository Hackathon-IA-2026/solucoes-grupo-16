import numpy as np
import pandas as pd
import pytest

xr = pytest.importorskip("xarray")

from ingestion.era5.extract_points import extract_from_dataset


def test_extract_nearest_point_and_prefer_final_expver():
    times = pd.date_range("2024-01-01", periods=2, freq="h")
    coords = {
        "expver": [1, 5],
        "time": times,
        "latitude": [-5.0, -5.25],
        "longitude": [-36.0, -35.75],
    }
    shape = (2, 2, 2, 2)
    final_and_preliminary = np.full(shape, np.nan)
    final_and_preliminary[0, :, :, :] = 10.0
    final_and_preliminary[1, :, :, :] = 20.0
    final_and_preliminary[0, 1, :, :] = np.nan
    dataset = xr.Dataset({
        "u100": (("expver", "time", "latitude", "longitude"), final_and_preliminary),
        "v100": (("expver", "time", "latitude", "longitude"), final_and_preliminary + 1),
        "t2m": (("expver", "time", "latitude", "longitude"), final_and_preliminary + 280),
        "sp": (("expver", "time", "latitude", "longitude"), final_and_preliminary + 100000),
    }, coords=coords)
    plants = pd.DataFrame({
        "usina_id": ["u1"],
        "latitude": [-5.02],
        "longitude": [-36.02],
        "match_status": ["matched"],
    })
    weather, mapping, report = extract_from_dataset(dataset, plants)
    assert weather["u100"].tolist() == [10.0, 20.0]
    assert weather["era5_expver"].tolist() == [1, 5]
    assert mapping.loc[0, "era5_grid_latitude"] == -5.0
    assert mapping.loc[0, "era5_grid_longitude"] == -36.0
    assert report["duplicate_keys"] == 0


def test_group_weather_is_capacity_weighted_from_exact_member_locations():
    times = pd.date_range("2024-01-01", periods=1, freq="h")
    dataset = xr.Dataset({
        "u100": (("time", "latitude", "longitude"), [[[4.0, 8.0]]]),
        "v100": (("time", "latitude", "longitude"), [[[0.0, 0.0]]]),
        "t2m": (("time", "latitude", "longitude"), [[[290.0, 294.0]]]),
        "sp": (("time", "latitude", "longitude"), [[[100000.0, 100400.0]]]),
    }, coords={"time": times, "latitude": [-5.0], "longitude": [-36.0, -35.75]})
    plants = pd.DataFrame({
        "usina_id": ["group", "group"],
        "location_id": ["member-a", "member-b"],
        "latitude": [-5.0, -5.0],
        "longitude": [-36.0, -35.75],
        "capacidade_instalada_mw": [25.0, 75.0],
        "match_status": ["matched", "matched"],
    })
    weather, mapping, report = extract_from_dataset(dataset, plants)
    assert len(weather) == 1
    assert weather.loc[0, "u100"] == pytest.approx(7.0)
    assert weather.loc[0, "temperature_2m"] == pytest.approx(293.0)
    assert weather.loc[0, "era5_member_count"] == 2
    assert len(mapping) == 2
    assert report["plants"] == 1
