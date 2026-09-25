"""Validate user-supplied hourly wind and estimate physical wind potential."""
from __future__ import annotations

import csv
import hashlib
import io
import math
from dataclasses import asdict
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

import pandas as pd

from app.historical import HistoricalScenarioService
from ingestion.ons.hourly import _capacity_by_hour
from training.config import PhysicalCurveConfig
from training.physical_curve import physical_power_mw


REQUIRED_COLUMNS = {"timestamp_utc", "usina_id", "u100", "v100", "disponibilidade"}
MAX_ROWS = 50_000
INPUT_SCHEMA_VERSION = "normalized-ons-hourly-v1"
ESTIMATOR_VERSION = "physical-curve-v1"


class ClimateFileError(ValueError):
    pass


def _sha256_file(path) -> str | None:
    if path is None or not path.is_file():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_timestamp(value: str) -> datetime:
    try:
        timestamp = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise ClimateFileError("timestamp_utc deve ser uma data ISO 8601 válida.") from exc
    if timestamp.tzinfo is None or timestamp.utcoffset() is None:
        raise ClimateFileError("timestamp_utc deve incluir timezone, por exemplo Z ou -03:00.")
    timestamp = timestamp.astimezone(timezone.utc)
    if timestamp.minute or timestamp.second or timestamp.microsecond:
        raise ClimateFileError("timestamp_utc deve marcar uma hora cheia.")
    return timestamp


def _number(value: str | None, field: str, row: int) -> float:
    try:
        result = float((value or "").strip())
    except ValueError as exc:
        raise ClimateFileError(f"Linha {row}: {field} deve ser numérico.") from exc
    if not math.isfinite(result):
        raise ClimateFileError(f"Linha {row}: {field} deve ser finito.")
    return result


def parse_climate_csv(csv_text: str) -> pd.DataFrame:
    if not csv_text or len(csv_text.encode("utf-8")) > 5 * 1024 * 1024:
        raise ClimateFileError("O CSV deve ter conteúdo e no máximo 5 MB.")
    source = io.StringIO(csv_text.lstrip("\ufeff"), newline="")
    header = source.readline()
    delimiter = ";" if header.count(";") > header.count(",") else ","
    source.seek(0)
    reader = csv.DictReader(source, delimiter=delimiter)
    columns = [name.strip() for name in reader.fieldnames or []]
    if len(columns) != len(set(columns)) or not REQUIRED_COLUMNS.issubset(columns):
        missing = sorted(REQUIRED_COLUMNS - set(columns))
        raise ClimateFileError(f"Cabeçalho CSV inválido; colunas ausentes: {missing}.")
    reader.fieldnames = columns
    rows: list[dict] = []
    seen: set[tuple[str, datetime]] = set()
    for row_number, raw in enumerate(reader, start=2):
        if row_number > MAX_ROWS + 1:
            raise ClimateFileError(f"O CSV aceita no máximo {MAX_ROWS} linhas.")
        if None in raw:
            raise ClimateFileError(f"Linha {row_number}: número de colunas inválido.")
        if not any(value and value.strip() for value in raw.values()):
            continue
        timestamp = parse_timestamp(raw["timestamp_utc"] or "")
        plant_id = (raw["usina_id"] or "").strip()
        if not plant_id:
            raise ClimateFileError(f"Linha {row_number}: usina_id é obrigatório.")
        key = (plant_id, timestamp)
        if key in seen:
            raise ClimateFileError(f"Linha {row_number}: usina e hora duplicadas: {plant_id}, {timestamp.isoformat()}.")
        seen.add(key)
        u100 = _number(raw["u100"], "u100", row_number)
        v100 = _number(raw["v100"], "v100", row_number)
        availability = _number(raw["disponibilidade"], "disponibilidade", row_number)
        if math.hypot(u100, v100) > 50 or not 0 <= availability <= 1:
            raise ClimateFileError(f"Linha {row_number}: vento ou disponibilidade fora do intervalo aceito.")
        for optional, lower, upper in (("temperature_2m", 150, 350), ("surface_pressure", 50_000, 120_000)):
            if optional in raw and raw[optional] and raw[optional].strip():
                value = _number(raw[optional], optional, row_number)
                if not lower <= value <= upper:
                    raise ClimateFileError(f"Linha {row_number}: {optional} fora do intervalo aceito.")
        rows.append({"usina_id": plant_id, "timestamp_utc": timestamp,
                     "u100": u100, "v100": v100, "disponibilidade": availability})
    if not rows:
        raise ClimateFileError("O CSV não contém registros climáticos.")
    return pd.DataFrame(rows)


@dataclass
class ClimateFileService:
    historical: HistoricalScenarioService

    def inspect(self, csv_text: str) -> dict:
        frame = parse_climate_csv(csv_text)
        instants = sorted(frame.timestamp_utc.unique())
        return {"row_count": len(frame), "plant_count": int(frame.usina_id.nunique()),
                "timestamps": [timestamp.isoformat() for timestamp in instants],
                "sha256": hashlib.sha256(csv_text.encode("utf-8")).hexdigest()}

    def estimate(self, csv_text: str, selected_timestamp: str) -> dict:
        frame = parse_climate_csv(csv_text)
        timestamp = parse_timestamp(selected_timestamp)
        selected = frame.loc[frame.timestamp_utc.eq(timestamp)].copy()
        if selected.empty:
            raise ClimateFileError("A hora escolhida não existe no CSV.")
        catalog_path = self.historical.catalog_path
        if not catalog_path.is_file():
            raise ClimateFileError("O catálogo de usinas não está disponível.")
        catalog = pd.read_parquet(catalog_path)
        if not {"usina_id", "id_ons", "capacidade_instalada_mw", "match_status"}.issubset(catalog.columns):
            raise ClimateFileError("O catálogo não possui os campos necessários.")
        all_status = catalog.groupby("usina_id")["match_status"].apply(lambda values: values.eq("matched").all())
        invalid = sorted(set(selected.usina_id) - set(all_status[all_status].index))
        if invalid:
            raise ClimateFileError(f"Usinas sem cadastro totalmente conciliado: {', '.join(invalid)}.")
        capacity = _capacity_by_hour(selected, catalog.loc[catalog.match_status.eq("matched")])
        selected = selected.merge(capacity, on=["usina_id", "timestamp_utc"], how="left", validate="one_to_one")
        if selected.capacidade_instalada_mw.isna().any() or selected.capacidade_instalada_mw.le(0).any():
            raise ClimateFileError("Há usinas sem capacidade válida na hora escolhida.")
        metadata = self.historical._catalog_by_plant()
        allocations = self.historical._bus_allocations(pd.Timestamp(timestamp))
        observations = []
        global_warnings: set[str] = set()
        curve = PhysicalCurveConfig()
        for row in selected.sort_values("usina_id").itertuples(index=False):
            speed = math.hypot(row.u100, row.v100)
            generation = float(physical_power_mw(
                speed, row.capacidade_instalada_mw, row.disponibilidade, curve
            ))
            direction = (math.degrees(math.atan2(-row.u100, -row.v100)) + 360) % 360
            plant = metadata.get(row.usina_id, {})
            allocation = allocations.get(row.usina_id, {})
            coverage = float(allocation.get("coverage", 0))
            warnings = []
            if not allocation.get("allocations"):
                warnings.append("mapeamento_pwf_ausente")
                global_warnings.add("ha_usinas_sem_mapeamento_pwf")
            elif coverage < 100:
                warnings.append("mapeamento_pwf_parcial")
                global_warnings.add("ha_usinas_com_mapeamento_pwf_parcial")
            observations.append({"usina_id": row.usina_id, "ons_id": row.usina_id,
                "name": str(plant.get("name") or row.usina_id), "state": str(plant.get("state") or "NE"),
                "latitude": plant.get("latitude"), "longitude": plant.get("longitude"),
                "installed_capacity_mw": round(float(row.capacidade_instalada_mw), 6),
                "observed_generation_mw": None, "estimated_generation_mw": round(generation, 6),
                "capacity_factor_percent": round(generation / row.capacidade_instalada_mw * 100, 3),
                "u100": row.u100, "v100": row.v100, "wind_speed_mps": round(speed, 6),
                "wind_direction_degrees": round(direction, 3), "availability": row.disponibilidade,
                "generation_source": "PHYSICAL_CURVE", "weather_source": "USER",
                "suggested_bus_allocations": [{"bus_number": item["bus_number"], "bus_name": item["bus_name"],
                    "allocation_factor": round(item["allocation_factor"], 9),
                    "allocated_generation_mw": round(generation * item["allocation_factor"], 6)}
                    for item in allocation.get("allocations", [])],
                "mapping_coverage_percent": round(coverage, 3), "warnings": warnings})
        digest = hashlib.sha256(csv_text.encode("utf-8")).hexdigest()
        return {"scenario_id": str(uuid4()), "subsystem": "NE", "timestamp": timestamp.isoformat(),
            "resolution_minutes": 60, "data_version": f"user-csv-sha256-{digest}",
            "generation_source": "PHYSICAL_CURVE", "weather_source": "USER",
            "row_count": len(frame), "observations": observations, "warnings": sorted(global_warnings),
            "provenance": {"input_schema_version": INPUT_SCHEMA_VERSION,
                "input_sha256": digest, "catalog_sha256": _sha256_file(catalog_path),
                "mapping_sha256": _sha256_file(self.historical.mapping_path),
                "estimator_version": ESTIMATOR_VERSION,
                "physical_curve": asdict(curve)}}
