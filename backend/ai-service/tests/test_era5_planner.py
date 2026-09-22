from datetime import date

from ingestion.era5.request_planner import build_monthly_request, plan_requests
from ingestion.plants.catalog import SpatialBounds


def test_monthly_request_has_all_leap_year_hours_and_stable_hash():
    bounds = SpatialBounds(north=0.0, west=-46.0, south=-16.0, east=-34.0)
    first = build_monthly_request(2024, 2, bounds)
    second = build_monthly_request(2024, 2, bounds)
    assert first.expected_hours == 29 * 24
    assert first.payload["area"] == [0.0, -46.0, -16.0, -34.0]
    assert len(first.payload["time"]) == 24
    assert first.request_hash == second.request_hash


def test_plan_is_partitioned_by_calendar_month():
    bounds = SpatialBounds(north=0.0, west=-46.0, south=-16.0, east=-34.0)
    requests = plan_requests(date(2023, 12, 15), date(2024, 2, 2), bounds)
    assert [item.label for item in requests] == ["2023-12", "2024-01", "2024-02"]

