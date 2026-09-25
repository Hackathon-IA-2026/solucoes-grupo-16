import pandas as pd

from ingestion.pwf.mapping import build_pwf_bus_mapping


def test_build_pwf_mapping_connects_ceg_members_to_multiple_buses(tmp_path):
    workbook = tmp_path / "usinas.xlsx"
    pd.DataFrame(
        {
            "Número da Barra ": [101, 102, 201],
            "Nome da Usina": ["EOL UM A", "EOL UM B", "EOL DOIS"],
            "CEG": ["EOL.CV.RN.000001-0.01", "EOL.CV.RN.000001-0.01", "EOL.CV.RN.000002-0.01"],
            "Tipo da Usina": ["EOL", "EOL", "EOL"],
            "Estado da Federação": ["RN", "RN", "RN"],
            "Potência Instalada (MW) 2040": [60.0, 40.0, 50.0],
        }
    ).to_excel(workbook, sheet_name="Usinas", index=False)
    catalog = pd.DataFrame(
        {
            "usina_id": ["GROUP", "GROUP"],
            "location_id": ["member-1", "member-2"],
            "ceg_root": ["EOL.CV.RN.000001-0", "EOL.CV.RN.000002-0"],
            "capacidade_instalada_mw": [100.0, 50.0],
        }
    )

    mapping, report = build_pwf_bus_mapping(workbook, catalog)

    assert mapping["bus_number"].tolist() == [101, 102, 201]
    assert mapping["allocation_capacity_mw"].tolist() == [60.0, 40.0, 50.0]
    assert mapping["group_member_count"].unique().tolist() == [2]
    assert mapping["mapped_member_count"].unique().tolist() == [2]
    assert report["fully_mapped_plants"] == 1
    assert report["partially_mapped_plants"] == 0
