"""Build the ONS group-to-PWF bus allocation table from the official reference workbook."""
from __future__ import annotations

import pandas as pd

from ingestion.plants.catalog import ceg_root


WORKBOOK_COLUMNS = {
    "Número da Barra ": "bus_number",
    "Nome da Usina": "pwf_plant_name",
    "CEG": "ceg",
    "Tipo da Usina": "plant_type",
    "Estado da Federação": "state",
    "Potência Instalada (MW) 2040": "allocation_capacity_mw",
}


def build_pwf_bus_mapping(
    workbook_path,
    catalog: pd.DataFrame,
    *,
    sheet_name: str = "Usinas",
) -> tuple[pd.DataFrame, dict]:
    source = pd.read_excel(workbook_path, sheet_name=sheet_name)
    normalized_headers = {str(column).strip(): column for column in source.columns}
    selected: dict[str, str] = {}
    missing: list[str] = []
    for expected, target in WORKBOOK_COLUMNS.items():
        actual = normalized_headers.get(expected.strip())
        if actual is None:
            missing.append(expected.strip())
        else:
            selected[actual] = target
    if missing:
        raise ValueError(f"Colunas ausentes na planilha de usinas: {missing}")

    mapping = source[list(selected)].rename(columns=selected).copy()
    mapping["plant_type"] = mapping["plant_type"].astype("string").str.strip().str.upper()
    mapping = mapping[mapping["plant_type"].eq("EOL")].copy()
    mapping["bus_number"] = pd.to_numeric(mapping["bus_number"], errors="coerce")
    mapping["allocation_capacity_mw"] = pd.to_numeric(
        mapping["allocation_capacity_mw"], errors="coerce"
    )
    mapping["ceg_root"] = mapping["ceg"].map(ceg_root)
    mapping = mapping[
        mapping["bus_number"].notna()
        & mapping["bus_number"].gt(0)
        & mapping["allocation_capacity_mw"].notna()
        & mapping["allocation_capacity_mw"].gt(0)
        & mapping["ceg_root"].ne("")
    ].copy()
    mapping["bus_number"] = mapping["bus_number"].astype(int)

    catalog_required = {
        "usina_id",
        "location_id",
        "ceg_root",
        "capacidade_instalada_mw",
    }
    missing_catalog = sorted(catalog_required - set(catalog.columns))
    if missing_catalog:
        raise ValueError(f"Campos ausentes no catálogo: {missing_catalog}")
    catalog_columns = [
        "usina_id",
        "location_id",
        "ceg_root",
        "capacidade_instalada_mw",
    ]
    for optional in ["relationship_start", "relationship_end"]:
        if optional in catalog:
            catalog_columns.append(optional)
    identity = catalog[catalog_columns].copy()
    joined = identity.merge(mapping, on="ceg_root", how="left", validate="many_to_many")
    matched = joined[joined["bus_number"].notna()].copy()
    group_columns = [
        "usina_id",
        "location_id",
        "bus_number",
        "pwf_plant_name",
        "state",
    ]
    for optional in ["relationship_start", "relationship_end"]:
        if optional in matched:
            group_columns.append(optional)
    result = (
        matched.groupby(group_columns, as_index=False, dropna=False)
        .agg(
            allocation_capacity_mw=("allocation_capacity_mw", "sum"),
            member_capacity_mw=("capacidade_instalada_mw", "first"),
            ceg_root=("ceg_root", "first"),
        )
        .sort_values(["usina_id", "bus_number", "location_id"])
        .reset_index(drop=True)
    )

    member_status = joined.groupby(["usina_id", "location_id"], as_index=False).agg(
        matched=("bus_number", lambda values: bool(values.notna().any()))
    )
    group_status = member_status.groupby("usina_id")["matched"].agg(["count", "sum"])
    group_status = group_status.rename(
        columns={"count": "group_member_count", "sum": "mapped_member_count"}
    ).reset_index()
    result = result.merge(group_status, on="usina_id", how="left", validate="many_to_one")
    report = {
        "source_rows": int(len(source)),
        "wind_rows_with_positive_capacity": int(len(mapping)),
        "catalog_plants": int(identity["usina_id"].nunique()),
        "mapped_plants": int(result["usina_id"].nunique()),
        "mapped_buses": int(result["bus_number"].nunique()),
        "fully_mapped_plants": int(
            group_status["group_member_count"].eq(group_status["mapped_member_count"]).sum()
        ),
        "partially_mapped_plants": int(
            (
                group_status["mapped_member_count"].gt(0)
                & group_status["mapped_member_count"].lt(group_status["group_member_count"])
            ).sum()
        ),
        "unmapped_plants": int(group_status["mapped_member_count"].eq(0).sum()),
        "mapped_rows": int(len(result)),
    }
    return result, report
