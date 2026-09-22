"""Build the canonical ClimaGrid plant catalog from ONS and SIGA data."""
from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

from ingestion.common.io import read_tabular, utc_now_iso


ONS_REQUIRED = {"id_ons", "nom_usina", "ceg", "id_subsistema"}
SIGA_REQUIRED = {
    "CodCEG",
    "NomEmpreendimento",
    "SigUFPrincipal",
    "SigTipoGeracao",
    "DscFaseUsina",
    "MdaPotenciaOutorgadaKw",
    "MdaPotenciaFiscalizadaKw",
    "NumCoordNEmpreendimento",
    "NumCoordEEmpreendimento",
}
MEMBERSHIP_REQUIRED = {
    "id_subsistema",
    "id_ons_conjunto",
    "id_ons_usina",
    "nom_conjunto",
    "nom_usina",
    "ceg",
    "dat_iniciorelacionamento",
    "dat_fimrelacionamento",
}
NORTHEAST_GUARDRAIL = {"latitude_min": -18.0, "latitude_max": 2.0, "longitude_min": -48.0, "longitude_max": -32.0}


@dataclass(frozen=True)
class SpatialBounds:
    north: float
    west: float
    south: float
    east: float

    def as_cds_area(self) -> list[float]:
        return [self.north, self.west, self.south, self.east]

    def serializable(self) -> dict[str, float]:
        return asdict(self)


def normalize_text(value: object) -> str:
    if value is None or pd.isna(value):
        return ""
    return str(value).strip().upper()


def ceg_root(value: object) -> str:
    """Return a comparison key while preserving the original CEG elsewhere."""
    normalized = normalize_text(value)
    if not normalized or normalized == "-":
        return ""
    return re.sub(r"\.\d+$", "", normalized)


def _ascii_key(value: object) -> str:
    normalized = unicodedata.normalize("NFKD", str(value))
    return "".join(character for character in normalized if not unicodedata.combining(character)).lower()


def _find_column(frame: pd.DataFrame, aliases: Iterable[str]) -> str | None:
    lookup = {_ascii_key(column): column for column in frame.columns}
    for alias in aliases:
        found = lookup.get(_ascii_key(alias))
        if found:
            return found
    return None


def _number(series: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(series):
        return pd.to_numeric(series, errors="coerce")
    text = series.astype("string").str.strip()
    comma = text.str.contains(",", na=False)
    text.loc[comma] = text.loc[comma].str.replace(".", "", regex=False).str.replace(",", ".", regex=False)
    return pd.to_numeric(text, errors="coerce")


def load_ons_catalog(paths: Iterable[Path], subsystem: str = "NE") -> pd.DataFrame:
    frames = [read_tabular(path) for path in paths]
    if not frames:
        raise ValueError("Informe ao menos um arquivo ONS.")
    source = pd.concat(frames, ignore_index=True)
    aliases = {
        "id_ons": ["id_ons", "idons"],
        "nom_usina": ["nom_usina", "nome_usina"],
        "ceg": ["ceg", "cod_ceg", "codceg"],
        "id_subsistema": ["id_subsistema", "subsistema"],
        "id_estado": ["id_estado", "estado", "uf"],
    }
    rename: dict[str, str] = {}
    for canonical, options in aliases.items():
        column = _find_column(source, options)
        if column:
            rename[column] = canonical
    source = source.rename(columns=rename)
    missing = sorted(ONS_REQUIRED - set(source.columns))
    if missing:
        raise ValueError(f"Campos ONS ausentes: {missing}")
    source["id_subsistema"] = source["id_subsistema"].map(normalize_text)
    source = source[source["id_subsistema"] == normalize_text(subsystem)].copy()
    for column in ["id_ons", "nom_usina", "ceg"]:
        source[column] = source[column].astype("string").str.strip()
    source["ceg_normalized"] = source["ceg"].map(normalize_text)
    source["ceg_root"] = source["ceg"].map(ceg_root)
    if "id_estado" not in source:
        source["id_estado"] = pd.NA
    columns = ["id_ons", "nom_usina", "ceg", "ceg_normalized", "ceg_root", "id_estado", "id_subsistema"]
    universe = source[columns].drop_duplicates().reset_index(drop=True)
    conflicting = universe.groupby("id_ons", dropna=False)["ceg_normalized"].nunique()
    bad_ids = conflicting[conflicting > 1].index.astype(str).tolist()
    if bad_ids:
        raise ValueError(f"IDs ONS associados a múltiplos CEGs: {bad_ids[:10]}")
    return universe.drop_duplicates("id_ons", keep="last").reset_index(drop=True)


def load_ons_membership(path: Path, subsystem: str = "NE") -> pd.DataFrame:
    membership = read_tabular(path)
    missing = sorted(MEMBERSHIP_REQUIRED - set(membership.columns))
    if missing:
        raise ValueError(f"Campos do relacionamento ONS ausentes: {missing}")
    membership = membership.copy()
    membership["id_subsistema"] = membership["id_subsistema"].map(normalize_text)
    membership = membership[membership["id_subsistema"].eq(normalize_text(subsystem))]
    for column in ["id_ons_conjunto", "id_ons_usina", "nom_conjunto", "nom_usina", "ceg"]:
        membership[column] = membership[column].astype("string").str.strip()
    membership["relationship_start"] = pd.to_datetime(membership["dat_iniciorelacionamento"], errors="coerce")
    membership["relationship_end"] = pd.to_datetime(membership["dat_fimrelacionamento"], errors="coerce")
    if membership["id_ons_conjunto"].isna().any() or membership["id_ons_usina"].isna().any():
        raise ValueError("O relacionamento ONS contém identificadores nulos.")
    return membership.reset_index(drop=True)


def expand_ons_groups(ons: pd.DataFrame, membership: pd.DataFrame | None) -> pd.DataFrame:
    """Expand ONS group rows to their exact member plants without inventing a centroid."""
    by_group = {} if membership is None else {
        str(key).strip(): group for key, group in membership.groupby("id_ons_conjunto", dropna=False)
    }
    records: list[dict] = []
    for row in ons.to_dict("records"):
        parent_id = str(row["id_ons"]).strip()
        if row["ceg_normalized"] not in {"", "-"}:
            record = dict(row)
            record.update({
                "member_id_ons": parent_id,
                "nom_membro_ons": row["nom_usina"],
                "is_group": False,
                "relationship_start": pd.NaT,
                "relationship_end": pd.NaT,
            })
            records.append(record)
            continue
        members = by_group.get(parent_id)
        if members is None or members.empty:
            record = dict(row)
            record.update({
                "member_id_ons": parent_id,
                "nom_membro_ons": row["nom_usina"],
                "is_group": True,
                "relationship_start": pd.NaT,
                "relationship_end": pd.NaT,
            })
            records.append(record)
            continue
        for member in members.to_dict("records"):
            member_ceg = member["ceg"]
            record = dict(row)
            record.update({
                "ceg": member_ceg,
                "ceg_normalized": normalize_text(member_ceg),
                "ceg_root": ceg_root(member_ceg),
                "member_id_ons": str(member["id_ons_usina"]).strip(),
                "nom_membro_ons": member["nom_usina"],
                "is_group": True,
                "relationship_start": member["relationship_start"],
                "relationship_end": member["relationship_end"],
            })
            records.append(record)
    expanded = pd.DataFrame.from_records(records)
    return expanded.sort_values(["id_ons", "member_id_ons", "relationship_start"], na_position="first").reset_index(drop=True)


def load_siga_catalog(path: Path) -> pd.DataFrame:
    source = read_tabular(path, sep=";", decimal=",") if path.suffix.lower() != ".parquet" else read_tabular(path)
    missing = sorted(SIGA_REQUIRED - set(source.columns))
    if missing:
        raise ValueError(f"Campos SIGA ausentes: {missing}")
    siga = source.copy()
    siga["ceg_siga"] = siga["CodCEG"].astype("string").str.strip()
    siga["ceg_normalized"] = siga["ceg_siga"].map(normalize_text)
    siga["ceg_root"] = siga["ceg_siga"].map(ceg_root)
    siga["latitude"] = _number(siga["NumCoordNEmpreendimento"])
    siga["longitude"] = _number(siga["NumCoordEEmpreendimento"])
    granted = _number(siga["MdaPotenciaOutorgadaKw"])
    inspected = _number(siga["MdaPotenciaFiscalizadaKw"])
    siga["capacidade_instalada_mw"] = inspected.where(inspected > 0, granted) / 1000.0
    siga = siga.rename(columns={
        "NomEmpreendimento": "nom_empreendimento_siga",
        "SigUFPrincipal": "uf_siga",
        "SigTipoGeracao": "tipo_geracao_siga",
        "DscFaseUsina": "fase_usina",
    })
    columns = [
        "ceg_siga", "ceg_normalized", "ceg_root", "nom_empreendimento_siga",
        "uf_siga", "tipo_geracao_siga", "fase_usina", "latitude", "longitude",
        "capacidade_instalada_mw",
    ]
    return siga[columns].copy()


def _load_overrides(path: Path | None) -> dict[str, str]:
    if path is None:
        return {}
    frame = read_tabular(path)
    key_column = "location_id" if "location_id" in frame else "id_ons"
    required = {key_column, "ceg_siga"}
    missing = sorted(required - set(frame.columns))
    if missing:
        raise ValueError(f"Campos de override ausentes: {missing}")
    return {
        str(key).strip(): normalize_text(ceg)
        for key, ceg in frame[[key_column, "ceg_siga"]].itertuples(index=False, name=None)
    }


def reconcile_catalog(
    ons: pd.DataFrame,
    siga: pd.DataFrame,
    *,
    overrides_path: Path | None = None,
    location_source: str = "SIGA/ANEEL",
) -> tuple[pd.DataFrame, dict]:
    exact_groups = {key: group for key, group in siga.groupby("ceg_normalized", dropna=False)}
    root_groups = {key: group for key, group in siga[siga["ceg_root"] != ""].groupby("ceg_root")}
    overrides = _load_overrides(overrides_path)
    extracted_at = utc_now_iso()
    records: list[dict] = []

    for row in ons.to_dict("records"):
        matched: pd.Series | None = None
        method = "unresolved"
        status = "unresolved"
        reason = "ceg_not_found"
        ons_id = str(row["id_ons"]).strip()
        location_id = str(row.get("member_id_ons", ons_id)).strip()
        normalized = row["ceg_normalized"]
        root = row["ceg_root"]

        if normalized in {"", "-"}:
            reason = "unresolved_group"
        elif location_id in overrides:
            candidates = exact_groups.get(overrides[location_id])
            if candidates is not None and len(candidates) == 1:
                matched = candidates.iloc[0]
                method, status, reason = "manual", "matched", ""
            else:
                reason = "invalid_manual_override"
        else:
            candidates = exact_groups.get(normalized)
            if candidates is not None and len(candidates) == 1:
                matched = candidates.iloc[0]
                method, status, reason = "exact_ceg", "matched", ""
            elif candidates is not None and len(candidates) > 1:
                status, reason = "review_required", "ambiguous_exact_ceg"
            else:
                candidates = root_groups.get(root)
                if candidates is not None and len(candidates) == 1:
                    matched = candidates.iloc[0]
                    method, status, reason = "unique_ceg_root", "matched", ""
                elif candidates is not None and len(candidates) > 1:
                    status, reason = "review_required", "ambiguous_ceg_root"

        record = {
            "usina_id": ons_id,
            "id_ons": ons_id,
            "location_id": location_id,
            "member_id_ons": location_id,
            "is_group": bool(row.get("is_group", False)),
            "ceg": row["ceg"],
            "ceg_siga": pd.NA,
            "ceg_root": root,
            "nom_usina_ons": row["nom_usina"],
            "nom_membro_ons": row.get("nom_membro_ons", row["nom_usina"]),
            "nom_empreendimento_siga": pd.NA,
            "uf_ons": row.get("id_estado", pd.NA),
            "uf_siga": pd.NA,
            "id_subsistema": row["id_subsistema"],
            "latitude": np.nan,
            "longitude": np.nan,
            "capacidade_instalada_mw": np.nan,
            "fase_usina": pd.NA,
            "match_method": method,
            "match_status": status,
            "match_reason": reason,
            "location_source": location_source,
            "source_extracted_at": extracted_at,
            "relationship_start": row.get("relationship_start", pd.NaT),
            "relationship_end": row.get("relationship_end", pd.NaT),
        }
        if matched is not None:
            record.update({
                "ceg_siga": matched["ceg_siga"],
                "nom_empreendimento_siga": matched["nom_empreendimento_siga"],
                "uf_siga": matched["uf_siga"],
                "latitude": matched["latitude"],
                "longitude": matched["longitude"],
                "capacidade_instalada_mw": matched["capacidade_instalada_mw"],
                "fase_usina": matched["fase_usina"],
            })
            coordinate_ok = (
                pd.notna(record["latitude"])
                and pd.notna(record["longitude"])
                and -90 <= float(record["latitude"]) <= 90
                and -180 <= float(record["longitude"]) <= 180
            )
            if not coordinate_ok:
                record["match_status"] = "review_required"
                record["match_reason"] = "invalid_or_missing_coordinates"
            elif not (
                NORTHEAST_GUARDRAIL["latitude_min"] <= float(record["latitude"]) <= NORTHEAST_GUARDRAIL["latitude_max"]
                and NORTHEAST_GUARDRAIL["longitude_min"] <= float(record["longitude"]) <= NORTHEAST_GUARDRAIL["longitude_max"]
            ):
                record["match_status"] = "review_required"
                record["match_reason"] = "coordinates_outside_northeast_guardrail"
            elif normalize_text(matched["tipo_geracao_siga"]) != "EOL":
                record["match_status"] = "review_required"
                record["match_reason"] = "siga_generation_type_not_eol"
        records.append(record)

    catalog = pd.DataFrame.from_records(records).sort_values(["usina_id", "location_id", "relationship_start"], na_position="first").reset_index(drop=True)
    counts = catalog["match_status"].value_counts(dropna=False).to_dict()
    plant_fully_located = catalog.groupby("usina_id")["match_status"].apply(lambda values: bool(values.eq("matched").all()))
    report = {
        "rows": int(len(catalog)),
        "plants": int(catalog["usina_id"].nunique()),
        "matched": int(counts.get("matched", 0)),
        "review_required": int(counts.get("review_required", 0)),
        "unresolved": int(counts.get("unresolved", 0)),
        "coverage": float(counts.get("matched", 0) / len(catalog)) if len(catalog) else 0.0,
        "plants_fully_located": int(plant_fully_located.sum()),
        "plant_coverage": float(plant_fully_located.mean()) if len(plant_fully_located) else 0.0,
        "match_methods": {str(key): int(value) for key, value in catalog["match_method"].value_counts().items()},
        "reasons": {str(key): int(value) for key, value in catalog["match_reason"].value_counts().items()},
    }
    return catalog, report


def calculate_bounds(catalog: pd.DataFrame, margin: float = 0.5, resolution: float = 0.25) -> SpatialBounds:
    valid = catalog[
        catalog["match_status"].eq("matched")
        & catalog["latitude"].notna()
        & catalog["longitude"].notna()
    ]
    if valid.empty:
        raise ValueError("O catálogo não possui coordenadas válidas para calcular a área ERA5.")
    north = math.ceil((float(valid["latitude"].max()) + margin) / resolution) * resolution
    south = math.floor((float(valid["latitude"].min()) - margin) / resolution) * resolution
    west = math.floor((float(valid["longitude"].min()) - margin) / resolution) * resolution
    east = math.ceil((float(valid["longitude"].max()) + margin) / resolution) * resolution
    return SpatialBounds(north=north, west=west, south=south, east=east)
