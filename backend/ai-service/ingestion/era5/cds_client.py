"""CDS download adapter with atomic files, retries and manifests."""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any, Callable

from ingestion.common.io import sha256_file, utc_now_iso
from ingestion.common.manifests import is_completed, write_manifest
from ingestion.era5.request_planner import MonthlyRequest


Retrieve = Callable[[str, dict, str], Any]


def _validate_netcdf(path: Path) -> None:
    try:
        import xarray as xr
    except ImportError as exc:  # pragma: no cover - declared runtime dependency
        raise RuntimeError("Instale xarray e netCDF4 antes de baixar dados ERA5.") from exc
    expected_groups = [
        {"u100", "100m_u_component_of_wind"},
        {"v100", "100m_v_component_of_wind"},
        {"t2m", "temperature_2m", "2m_temperature"},
        {"sp", "surface_pressure"},
    ]
    with xr.open_dataset(path, engine="netcdf4") as dataset:
        available = set(dataset.data_vars)
        missing = [sorted(options) for options in expected_groups if not options & available]
        if missing:
            raise ValueError(f"NetCDF sem variáveis obrigatórias: {missing}")
        if not ({"time", "valid_time"} & (set(dataset.coords) | set(dataset.dims))):
            raise ValueError("NetCDF sem coordenada temporal time/valid_time.")


def _is_retryable(error: Exception) -> bool:
    message = str(error).lower()
    permanent_markers = ("401", "403", "unauthorized", "forbidden", "terms", "licence", "license", "invalid request")
    return not any(marker in message for marker in permanent_markers)


def _default_retrieve() -> Retrieve:
    try:
        import cdsapi
    except ImportError as exc:  # pragma: no cover - depends on optional runtime package
        raise RuntimeError("Instale cdsapi e configure a credencial do CDS antes do download.") from exc
    client = cdsapi.Client()
    return client.retrieve


def download_month(
    request: MonthlyRequest,
    output: Path,
    manifest_path: Path,
    *,
    overwrite: bool = False,
    max_attempts: int = 3,
    retrieve: Retrieve | None = None,
) -> dict:
    if not overwrite and is_completed(manifest_path, request.request_hash, output):
        return {"status": "skipped", "path": str(output), "request_hash": request.request_hash}

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".part")
    temporary.unlink(missing_ok=True)
    retrieve_call = retrieve or _default_retrieve()
    started_at = utc_now_iso()
    error: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            retrieve_call(request.dataset, request.payload, str(temporary))
            if not temporary.exists() or temporary.stat().st_size == 0:
                raise RuntimeError("O CDS não produziu um arquivo NetCDF válido.")
            _validate_netcdf(temporary)
            os.replace(temporary, output)
            manifest = {
                "status": "completed",
                "dataset": request.dataset,
                "year": request.year,
                "month": request.month,
                "expected_hours": request.expected_hours,
                "payload": request.payload,
                "request_hash": request.request_hash,
                "started_at": started_at,
                "completed_at": utc_now_iso(),
                "attempts": attempt,
                "path": str(output),
                "size_bytes": output.stat().st_size,
                "sha256": sha256_file(output),
            }
            write_manifest(manifest_path, manifest)
            return manifest
        except Exception as exc:  # CDS exposes several transport exception types
            error = exc
            temporary.unlink(missing_ok=True)
            if attempt < max_attempts and _is_retryable(exc):
                time.sleep(min(2 ** (attempt - 1), 30))
            else:
                break

    failure = {
        "status": "failed",
        "dataset": request.dataset,
        "year": request.year,
        "month": request.month,
        "payload": request.payload,
        "request_hash": request.request_hash,
        "started_at": started_at,
        "failed_at": utc_now_iso(),
        "attempts": attempt,
        "error": f"{type(error).__name__}: {error}",
    }
    write_manifest(manifest_path, failure)
    raise RuntimeError(f"Falha ao baixar ERA5 {request.label}: {error}") from error
