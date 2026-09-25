import pandas as pd
import pytest

from ingestion.ons.hourly import (
    join_ons_era5,
    prepare_ons_generation_hourly,
    prepare_ons_hourly,
)
from ingestion.ons.source_client import ons_generation_url, ons_restriction_url


def test_official_monthly_generation_url():
    assert ons_generation_url(2024, 1).endswith(
        "/geracao_usina_2_ho/GERACAO_USINA-2_2024_01.parquet"
    )


def test_official_monthly_restriction_url():
    assert ons_restriction_url(2024, 1).endswith(
        "/restricao_coff_eolica_tm/RESTRICAO_COFF_EOLICA_2024_01.parquet"
    )


def test_observed_generation_filters_scope_and_converts_local_time_to_utc():
    ons = pd.DataFrame(
        {
            "din_instante": [
                "2024-01-01 00:00:00",
                "2024-01-01 00:00:00",
                "2024-01-01 00:00:00",
                "2024-01-01 00:00:00",
            ],
            "id_subsistema": ["NE", "NE", "S", "NE"],
            "nom_tipousina": [
                "EOLIELÉTRICA",
                "EOLIELÉTRICA",
                "EOLIELÉTRICA",
                "FOTOVOLTAICA",
            ],
            "id_ons": ["u1", None, "u2", "u3"],
            "val_geracao": [25.5, 4.0, 30.0, 12.0],
        }
    )
    catalog = pd.DataFrame(
        {"id_ons": ["u1"], "capacidade_instalada_mw": [50.0]}
    )

    hourly, report = prepare_ons_generation_hourly(ons, catalog)

    assert len(hourly) == 1
    assert hourly.loc[0, "usina_id"] == "u1"
    assert hourly.loc[0, "timestamp_utc"] == pd.Timestamp(
        "2024-01-01 03:00:00+00:00"
    )
    assert hourly.loc[0, "geracao_verificada_mw"] == pytest.approx(25.5)
    assert hourly.loc[0, "fator_capacidade"] == pytest.approx(0.51)
    assert report["excluded_missing_ons_id"] == 1


def test_ons_half_hours_are_averaged_and_converted_to_utc():
    ons = pd.DataFrame({
        "id_ons": ["u1", "u1"],
        "din_instante": ["2024-01-01 00:00:00", "2024-01-01 00:30:00"],
        "val_disponibilidade": ["40,0", "50,0"],
        "val_geracaoreferencia": ["30,0", "40,0"],
        "val_geracao": ["25,0", "35,0"],
    })
    catalog = pd.DataFrame({"id_ons": ["u1"], "capacidade_instalada_mw": [50.0]})
    hourly, report = prepare_ons_hourly(ons, catalog)
    assert len(hourly) == 1
    assert hourly.loc[0, "timestamp_utc"] == pd.Timestamp("2024-01-01 03:00:00+00:00")
    assert hourly.loc[0, "geracao_referencia_mw"] == pytest.approx(35.0)
    assert hourly.loc[0, "disponibilidade"] == pytest.approx(0.9)
    assert report["rows_valid"] == 1
    assert report["availability_clipped_to_one"] == 0


def test_incomplete_ons_hour_is_excluded():
    ons = pd.DataFrame({
        "id_ons": ["u1"],
        "din_instante": ["2024-01-01 00:00:00"],
        "val_disponibilidade": [40.0],
        "val_geracaoreferencia": [30.0],
        "val_geracao": [25.0],
    })
    catalog = pd.DataFrame({"id_ons": ["u1"], "capacidade_instalada_mw": [50.0]})
    hourly, report = prepare_ons_hourly(ons, catalog)
    assert hourly.empty
    assert report["incomplete_hours"] == 1


def test_join_requires_unique_keys_and_reports_coverage():
    ons = pd.DataFrame({
        "usina_id": ["u1"],
        "timestamp_utc": [pd.Timestamp("2024-01-01 03:00:00+00:00")],
        "disponibilidade": [0.9],
    })
    weather = pd.DataFrame({
        "usina_id": ["u1"],
        "timestamp_utc": [pd.Timestamp("2024-01-01 03:00:00+00:00")],
        "u100": [7.0],
    })
    joined, report = join_ons_era5(ons, weather)
    assert len(joined) == 1
    assert report["ons_join_coverage"] == 1.0


def test_conflicting_duplicate_ons_interval_is_rejected():
    ons = pd.DataFrame({
        "id_ons": ["u1", "u1"],
        "din_instante": ["2024-01-01 00:00:00", "2024-01-01 00:00:00"],
        "val_disponibilidade": [40.0, 41.0],
        "val_geracaoreferencia": [30.0, 30.0],
        "val_geracao": [25.0, 25.0],
    })
    catalog = pd.DataFrame({"id_ons": ["u1"], "capacidade_instalada_mw": [50.0]})
    with pytest.raises(ValueError, match="conflitantes"):
        prepare_ons_hourly(ons, catalog)


def test_group_availability_uses_sum_of_active_member_capacities():
    ons = pd.DataFrame({
        "id_ons": ["group", "group"],
        "din_instante": ["2024-01-01 00:00:00", "2024-01-01 00:30:00"],
        "val_disponibilidade": [90.0, 90.0],
        "val_geracaoreferencia": [60.0, 60.0],
        "val_geracao": [55.0, 55.0],
    })
    catalog = pd.DataFrame({
        "id_ons": ["group", "group"],
        "location_id": ["a", "b"],
        "capacidade_instalada_mw": [25.0, 75.0],
        "relationship_start": [pd.Timestamp("2020-01-01"), pd.Timestamp("2020-01-01")],
        "relationship_end": [pd.NaT, pd.NaT],
    })
    hourly, _ = prepare_ons_hourly(ons, catalog)
    assert hourly.loc[0, "capacidade_instalada_mw"] == pytest.approx(100.0)
    assert hourly.loc[0, "disponibilidade"] == pytest.approx(0.9)
