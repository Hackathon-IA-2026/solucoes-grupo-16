"""Download the official ONS group-to-plant relationship snapshot."""
from __future__ import annotations

import os
from pathlib import Path
from urllib.request import Request, urlopen

from ingestion.common.io import sha256_file, utc_now_iso


ONS_MEMBERSHIP_URL = "https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/usina_conjunto/RELACIONAMENTO_USINA_CONJUNTO.parquet"


def download_ons_membership(output: Path, source_url: str = ONS_MEMBERSHIP_URL) -> dict:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".part")
    request = Request(source_url, headers={"User-Agent": "ClimaGrid/1.0"})
    with urlopen(request, timeout=180) as response, temporary.open("wb") as target:  # noqa: S310
        while chunk := response.read(1024 * 1024):
            target.write(chunk)
    if temporary.stat().st_size == 0:
        temporary.unlink(missing_ok=True)
        raise RuntimeError("O relacionamento ONS retornou um arquivo vazio.")
    os.replace(temporary, output)
    return {
        "source_url": source_url,
        "downloaded_at": utc_now_iso(),
        "path": str(output),
        "size_bytes": output.stat().st_size,
        "sha256": sha256_file(output),
    }


def download_ons_generation(output: Path, year: int) -> dict:
    source_url = f"https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/geracao_usina_2/GERACAO_USINA_{year}.csv"
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".part")
    request = Request(source_url, headers={"User-Agent": "ClimaGrid/1.0"})
    with urlopen(request, timeout=180) as response, temporary.open("wb") as target:  # noqa: S310
        while chunk := response.read(1024 * 1024):
            target.write(chunk)
    if temporary.stat().st_size == 0:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"A geração da ONS para {year} retornou um arquivo vazio.")
    os.replace(temporary, output)
    return {
        "source_url": source_url,
        "downloaded_at": utc_now_iso(),
        "path": str(output),
        "size_bytes": output.stat().st_size,
        "sha256": sha256_file(output),
    }

