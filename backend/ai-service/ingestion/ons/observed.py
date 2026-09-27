"""Canonical observed-generation snapshot; reference is independent audit data."""
from __future__ import annotations

import numpy as np
import pandas as pd

from ingestion.common.io import stable_hash
from ingestion.ons.hourly import (
    ONS_VALUE_COLUMNS, _numeric, _timestamps_utc, prepare_ons_generation_hourly,
)

KEYS = ["usina_id", "timestamp_utc"]
OBSERVED = "geracao_verificada_mw"
REFERENCE = "geracao_referencia_mw"
WEATHER = ["u100", "v100", "temperature_2m", "surface_pressure"]
SNAPSHOT_SCHEMA = "climagrid-observed-generation-snapshot-v1"


def keyed(frame: pd.DataFrame, label: str) -> pd.DataFrame:
    """Require actual hourly instants, never silently interpret naive time as UTC."""
    missing = set(KEYS) - set(frame)
    if missing:
        raise ValueError(f"{label}: chaves ausentes: {sorted(missing)}")
    result = frame.copy()
    result["usina_id"] = result["usina_id"].astype("string").str.strip()
    times = result["timestamp_utc"].map(pd.Timestamp)
    if any(pd.isna(t) or t.tzinfo is None for t in times):
        raise ValueError(f"{label}: timestamp inválido ou sem timezone.")
    result["timestamp_utc"] = pd.to_datetime(times, utc=True)
    if (result["usina_id"].isna() | result["usina_id"].isin(["", "-"])).any():
        raise ValueError(f"{label}: usina_id inválido.")
    if result["timestamp_utc"].ne(result["timestamp_utc"].dt.floor("h")).any():
        raise ValueError(f"{label}: instantes devem ser horários exatos.")
    if result.duplicated(KEYS).any():
        raise ValueError(f"{label}: chaves duplicadas.")
    return result.sort_values(KEYS).reset_index(drop=True)


def cohort(frame: pd.DataFrame) -> dict:
    keys = keyed(frame[KEYS], "coorte")
    return {
        "rows": len(keys), "hours": int(keys.timestamp_utc.nunique()),
        "plants": int(keys.usina_id.nunique()),
        "keys_sha256": stable_hash(keys.astype(str).to_dict("records")),
        "start_utc": keys.timestamp_utc.min().isoformat() if len(keys) else None,
        "end_utc": keys.timestamp_utc.max().isoformat() if len(keys) else None,
    }


def restriction_audit(frame: pd.DataFrame, timezone: str) -> tuple[pd.DataFrame, dict]:
    """Average two complete half hours, without capacity/availability selection."""
    required = {"id_ons", "din_instante", *ONS_VALUE_COLUMNS}
    if required - set(frame):
        raise ValueError(f"Restrição: campos ausentes: {sorted(required - set(frame))}")
    data = frame.copy()
    if "id_subsistema" in data:
        data = data.loc[data.id_subsistema.astype("string").str.strip().eq("NE")].copy()
    data["usina_id"] = data.id_ons.astype("string").str.strip()
    data["timestamp_utc"] = _timestamps_utc(data.din_instante, timezone)
    valid = (data.usina_id.notna() & ~data.usina_id.isin(["", "-"])
             & data.timestamp_utc.notna()
             & data.timestamp_utc.eq(data.timestamp_utc.dt.floor("30min")))
    invalid_keys = int((~valid).sum())
    data = data.loc[valid].copy()
    columns = []
    for source, target in ONS_VALUE_COLUMNS.items():
        target = "geracao_verificada_restricao_mw" if target == OBSERVED else target
        data[target] = _numeric(data[source])
        data.loc[~np.isfinite(data[target]) | data[target].lt(0), target] = np.nan
        columns.append(target)
    codes = [c for c in ("cod_razaorestricao", "cod_origemrestricao") if c in data]
    if codes:
        data["restriction_recorded"] = pd.concat([
            data[c].astype("string").fillna("").str.strip().ne("") for c in codes
        ], axis=1).any(axis=1).astype("boolean")
    else:
        data["restriction_recorded"] = pd.Series(pd.NA, index=data.index, dtype="boolean")
    duplicated = data.duplicated(KEYS, keep=False)
    values = columns + ["restriction_recorded"]
    if data.loc[duplicated].groupby(KEYS)[values].nunique(dropna=False).gt(1).any(axis=None):
        raise ValueError("Restrição: subintervalos conflitantes para a mesma chave.")
    duplicates_removed = int(data.duplicated(KEYS).sum())
    data = data.drop_duplicates(KEYS).copy()
    data["timestamp_utc"] = data.timestamp_utc.dt.floor("h")
    groups = data.groupby(KEYS)
    hourly = groups[columns].mean()
    counts = groups[columns].count()
    # pandas.mean skips NaNs; invalidate each field unless BOTH samples exist.
    hourly = hourly.where(counts.eq(2))
    hourly["restriction_interval_count"] = groups.size()
    hourly["restriction_recorded"] = groups.restriction_recorded.agg(
        lambda x: x.any() if x.notna().all() and len(x) == 2 else pd.NA
    ).astype("boolean")
    hourly = hourly.reset_index()
    return hourly, {
        "rows_input": len(frame), "invalid_keys": invalid_keys,
        "duplicates_removed": duplicates_removed, "hours": len(hourly),
        "incomplete_hours": int(hourly.restriction_interval_count.ne(2).sum()),
        "invalid_or_incomplete_reference_hours": int(hourly[REFERENCE].isna().sum()),
        "restriction_flag_semantics": "nonempty ONS reason/origin code in either half hour; unknown if absent/incomplete",
    }


def build_observed_snapshot(
    generation: pd.DataFrame, restriction: pd.DataFrame, weather: pd.DataFrame,
    catalog: pd.DataFrame, *, source_timezone: str = "America/Sao_Paulo",
) -> tuple[pd.DataFrame, dict]:
    observed, generation_report = prepare_ons_generation_hourly(
        generation, catalog, source_timezone=source_timezone,
        reject_conflicting_duplicates=True,
    )
    observed = keyed(observed, "geração")
    weather = keyed(weather, "ERA5")
    if set(WEATHER) - set(weather):
        raise ValueError(f"ERA5: campos ausentes: {sorted(set(WEATHER) - set(weather))}")
    # Only climate/provenance may come from ERA5, never target columns.
    weather = weather[KEYS + WEATHER + [c for c in weather if c.startswith("era5_")]].copy()
    for col in WEATHER:
        weather[col] = pd.to_numeric(weather[col], errors="coerce")
    valid_weather = (np.isfinite(weather[WEATHER]).all(axis=1)
                     & np.hypot(weather.u100, weather.v100).le(50)
                     & weather.temperature_2m.between(150, 350)
                     & weather.surface_pressure.between(50000, 120000))
    invalid_weather_keys = weather.loc[~valid_weather, KEYS]
    matched_invalid_weather = observed[KEYS].merge(invalid_weather_keys, on=KEYS)
    joined = observed.merge(weather.loc[valid_weather], on=KEYS, validate="one_to_one")
    restriction_hourly, restriction_report = restriction_audit(restriction, source_timezone)
    joined = joined.merge(restriction_hourly, on=KEYS, how="left", validate="one_to_one")
    joined["disponibilidade"] = joined.disponibilidade_mw / joined.capacidade_instalada_mw
    joined["observed_generation_source"] = "GERACAO_USINA-2_HO.val_geracao"
    joined["reference_generation_source"] = "RESTRICAO_COFF_EOLICA_TM.val_geracaoreferencia"
    joined = keyed(joined, "snapshot")
    if joined.empty:
        raise ValueError("Nenhuma linha ONS–ERA5 conciliada.")
    difference = joined[OBSERVED] - joined.geracao_verificada_restricao_mw
    missing = observed[KEYS].merge(joined[KEYS], on=KEYS, how="left", indicator=True)
    missing = missing.loc[missing._merge.eq("left_only"), KEYS]
    monthly = []
    local_month = observed.timestamp_utc.dt.tz_convert(source_timezone).dt.strftime("%Y-%m")
    for month, group in observed.groupby(local_month):
        matched = group[KEYS].merge(joined[KEYS], on=KEYS)
        monthly.append({"month_local": month, "ons_rows": len(group),
                        "joined_rows": len(matched), "coverage": len(matched) / len(group),
                        "ons_plants": int(group.usina_id.nunique()),
                        "joined_plants": int(matched.usina_id.nunique())})
    report = {
        "schema_version": SNAPSHOT_SCHEMA, "primary_target": OBSERVED,
        "secondary_target": REFERENCE, "source_timezone": source_timezone,
        "scientifically_approved": False, "target_based_filtering": False,
        "generation": generation_report, "restriction": restriction_report,
        "cohort": cohort(joined),
        "join": {"ons_rows": len(observed), "joined_rows": len(joined),
                 "coverage": len(joined) / len(observed),
                 "invalid_weather_rows": len(matched_invalid_weather),
                 "missing_or_invalid_weather_rows": len(missing),
                 "unmatched_by_plant": missing.groupby("usina_id").size().to_dict(),
                 "monthly": monthly},
        "source_reconciliation": {
            "paired_rows": int(difference.notna().sum()),
            "mae_mw": float(difference.abs().mean()) if difference.notna().any() else None,
            "max_abs_difference_mw": float(difference.abs().max()) if difference.notna().any() else None,
            "rows_above_0_001_mw": int(difference.abs().gt(.001).sum()),
        },
        "missing_reference_rows": int(joined[REFERENCE].isna().sum()),
        "reference_above_capacity_rows_retained": int(joined[REFERENCE].gt(joined.capacidade_instalada_mw).sum()),
        "availability_outside_0_1_rows_retained": int((~joined.disponibilidade.between(0, 1)).sum()),
        "warnings": ["Cadastro e cobertura parciais devem permanecer explícitos.",
                     "Disponibilidade histórica não equivale a disponibilidade conhecida antecipadamente."],
    }
    return joined, report
