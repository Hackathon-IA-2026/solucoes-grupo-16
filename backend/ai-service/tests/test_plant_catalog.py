from pathlib import Path

import pandas as pd
import pytest

from ingestion.plants.catalog import (
    calculate_bounds,
    ceg_root,
    expand_ons_groups,
    load_ons_catalog,
    load_siga_catalog,
    reconcile_catalog,
)


def test_ceg_root_removes_only_terminal_unit_suffix():
    assert ceg_root(" EOL.CV.BA.012345-6.01 ") == "EOL.CV.BA.012345-6"
    assert ceg_root("-") == ""


def test_ons_catalog_can_filter_wind_from_the_full_generation_dataset(tmp_path: Path):
    path = tmp_path / "generation.parquet"
    pd.DataFrame(
        {
            "id_ons": ["wind", "solar"],
            "nom_usina": ["Parque eólico", "Parque solar"],
            "ceg": ["EOL.CV.RN.1-0", "UFV.RS.RN.2-0"],
            "id_subsistema": ["NE", "NE"],
            "id_estado": ["RN", "RN"],
            "nom_tipousina": ["EOLIELÉTRICA", "FOTOVOLTAICA"],
        }
    ).to_parquet(path, index=False)

    result = load_ons_catalog([path], subsystem="NE", plant_type="EOL")

    assert result["id_ons"].tolist() == ["wind"]


def test_siga_parser_handles_decimal_comma_and_capacity(tmp_path: Path):
    path = tmp_path / "siga.csv"
    path.write_text(
        ";".join([
            "CodCEG", "NomEmpreendimento", "SigUFPrincipal", "SigTipoGeracao",
            "DscFaseUsina", "MdaPotenciaOutorgadaKw", "MdaPotenciaFiscalizadaKw",
            "NumCoordNEmpreendimento", "NumCoordEEmpreendimento",
        ])
        + "\n"
        + ";".join(["EOL.CV.BA.1-0.1", "Parque A", "BA", "EOL", "Operação", "120000,0", "100000,0", "-10,25", "-40,50"]),
        encoding="utf-8",
    )
    siga = load_siga_catalog(path)
    assert siga.loc[0, "latitude"] == pytest.approx(-10.25)
    assert siga.loc[0, "longitude"] == pytest.approx(-40.5)
    assert siga.loc[0, "capacidade_instalada_mw"] == pytest.approx(100.0)


def test_reconcile_prefers_exact_and_rejects_ambiguous_root():
    ons = pd.DataFrame([
        {"id_ons": "u1", "nom_usina": "A", "ceg": "EOL.CV.BA.1-0.1", "ceg_normalized": "EOL.CV.BA.1-0.1", "ceg_root": "EOL.CV.BA.1-0", "id_estado": "BA", "id_subsistema": "NE"},
        {"id_ons": "u2", "nom_usina": "B", "ceg": "EOL.CV.RN.2-0", "ceg_normalized": "EOL.CV.RN.2-0", "ceg_root": "EOL.CV.RN.2-0", "id_estado": "RN", "id_subsistema": "NE"},
        {"id_ons": "u3", "nom_usina": "Grupo", "ceg": "-", "ceg_normalized": "-", "ceg_root": "", "id_estado": "CE", "id_subsistema": "NE"},
    ])
    siga = pd.DataFrame([
        {"ceg_siga": "EOL.CV.BA.1-0.1", "ceg_normalized": "EOL.CV.BA.1-0.1", "ceg_root": "EOL.CV.BA.1-0", "nom_empreendimento_siga": "A", "uf_siga": "BA", "tipo_geracao_siga": "EOL", "fase_usina": "Operação", "latitude": -10.0, "longitude": -40.0, "capacidade_instalada_mw": 50.0},
        {"ceg_siga": "EOL.CV.RN.2-0.1", "ceg_normalized": "EOL.CV.RN.2-0.1", "ceg_root": "EOL.CV.RN.2-0", "nom_empreendimento_siga": "B1", "uf_siga": "RN", "tipo_geracao_siga": "EOL", "fase_usina": "Operação", "latitude": -5.0, "longitude": -36.0, "capacidade_instalada_mw": 30.0},
        {"ceg_siga": "EOL.CV.RN.2-0.2", "ceg_normalized": "EOL.CV.RN.2-0.2", "ceg_root": "EOL.CV.RN.2-0", "nom_empreendimento_siga": "B2", "uf_siga": "RN", "tipo_geracao_siga": "EOL", "fase_usina": "Operação", "latitude": -5.1, "longitude": -36.1, "capacidade_instalada_mw": 30.0},
    ])
    catalog, report = reconcile_catalog(ons, siga)
    by_id = catalog.set_index("usina_id")
    assert by_id.loc["u1", "match_method"] == "exact_ceg"
    assert by_id.loc["u2", "match_status"] == "review_required"
    assert by_id.loc["u2", "match_reason"] == "ambiguous_ceg_root"
    assert by_id.loc["u3", "match_reason"] == "unresolved_group"
    assert report["matched"] == 1
    assert report["plants"] == 3
    assert report["plant_coverage"] == pytest.approx(1 / 3)


def test_bounds_add_margin_and_snap_outward():
    catalog = pd.DataFrame({
        "match_status": ["matched", "matched"],
        "latitude": [-1.68, -14.83],
        "longitude": [-44.82, -34.97],
    })
    bounds = calculate_bounds(catalog)
    assert bounds.as_cds_area() == [-1.0, -45.5, -15.5, -34.25]


def test_zero_coordinates_are_sent_to_review_instead_of_expanding_era5_area():
    ons = pd.DataFrame([{
        "id_ons": "u1", "nom_usina": "A", "ceg": "EOL.CV.CE.1-0.1",
        "ceg_normalized": "EOL.CV.CE.1-0.1", "ceg_root": "EOL.CV.CE.1-0",
        "id_estado": "CE", "id_subsistema": "NE",
    }])
    siga = pd.DataFrame([{
        "ceg_siga": "EOL.CV.CE.1-0.1", "ceg_normalized": "EOL.CV.CE.1-0.1", "ceg_root": "EOL.CV.CE.1-0",
        "nom_empreendimento_siga": "A", "uf_siga": "CE", "tipo_geracao_siga": "EOL",
        "fase_usina": "Operação", "latitude": 0.0, "longitude": 0.0, "capacidade_instalada_mw": 10.0,
    }])
    catalog, _ = reconcile_catalog(ons, siga)
    assert catalog.loc[0, "match_status"] == "review_required"
    assert catalog.loc[0, "match_reason"] == "coordinates_outside_northeast_guardrail"


def test_group_is_expanded_to_exact_ons_members():
    ons = pd.DataFrame([{
        "id_ons": "group", "nom_usina": "Conjunto", "ceg": "-", "ceg_normalized": "-",
        "ceg_root": "", "id_estado": "RN", "id_subsistema": "NE",
    }])
    membership = pd.DataFrame([
        {"id_ons_conjunto": "group", "id_ons_usina": "member-a", "nom_usina": "A", "ceg": "EOL.CV.RN.1-0.1", "relationship_start": pd.Timestamp("2020-01-01"), "relationship_end": pd.NaT},
        {"id_ons_conjunto": "group", "id_ons_usina": "member-b", "nom_usina": "B", "ceg": "EOL.CV.RN.2-0.1", "relationship_start": pd.Timestamp("2021-01-01"), "relationship_end": pd.NaT},
    ])
    expanded = expand_ons_groups(ons, membership)
    assert expanded["id_ons"].tolist() == ["group", "group"]
    assert expanded["member_id_ons"].tolist() == ["member-a", "member-b"]
    assert expanded["ceg"].tolist() == ["EOL.CV.RN.1-0.1", "EOL.CV.RN.2-0.1"]
