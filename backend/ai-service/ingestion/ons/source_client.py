"""Download official ONS relationship, generation, and restriction snapshots."""
from __future__ import annotations

import os
from pathlib import Path
from urllib.request import Request, urlopen

from ingestion.common.io import sha256_file, utc_now_iso


ONS_MEMBERSHIP_URL = "https://ons-aws-prod-opendata.s3.amazonaws.com/dataset/usina_conjunto/RELACIONAMENTO_USINA_CONJUNTO.parquet"
ONS_GENERATION_BASE_URL = (
    "https://ons-aws-prod-opendata.s3.amazonaws.com/"
    "dataset/geracao_usina_2_ho"
)
ONS_RESTRICTION_BASE_URL = (
    "https://ons-aws-prod-opendata.s3.amazonaws.com/"
    "dataset/restricao_coff_eolica_tm"
)


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


def ons_generation_url(year: int, month: int) -> str:
    if year < 2022:
        raise ValueError(
            "O download mensal de geração da ONS está disponível a partir de 2022."
        )
    if not 1 <= month <= 12:
        raise ValueError("O mês da geração ONS deve estar entre 1 e 12.")
    return f"{ONS_GENERATION_BASE_URL}/GERACAO_USINA-2_{year}_{month:02d}.parquet"


def ons_restriction_url(year: int, month: int) -> str:
    if year < 2021:
        raise ValueError("Os arquivos mensais de restrição ONS começam em 2021.")
    if not 1 <= month <= 12:
        raise ValueError("O mês da restrição ONS deve estar entre 1 e 12.")
    return f"{ONS_RESTRICTION_BASE_URL}/RESTRICAO_COFF_EOLICA_{year}_{month:02d}.parquet"


def download_ons_generation(output: Path, year: int, month: int) -> dict:
    source_url = ons_generation_url(year, month)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".part")
    request = Request(source_url, headers={"User-Agent": "ClimaGrid/1.0"})
    with urlopen(request, timeout=180) as response, temporary.open("wb") as target:  # noqa: S310
        while chunk := response.read(1024 * 1024):
            target.write(chunk)
    if temporary.stat().st_size == 0:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(
            f"A geração da ONS para {year}-{month:02d} retornou um arquivo vazio."
        )
    os.replace(temporary, output)
    return {
        "source_url": source_url,
        "year": year,
        "month": month,
        "downloaded_at": utc_now_iso(),
        "path": str(output),
        "size_bytes": output.stat().st_size,
        "sha256": sha256_file(output),
    }


def download_ons_restriction(output: Path, year: int, month: int) -> dict:
    source_url = ons_restriction_url(year, month)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".part")
    request = Request(source_url, headers={"User-Agent": "ClimaGrid/1.0"})
    with urlopen(request, timeout=180) as response, temporary.open("wb") as target:  # noqa: S310
        while chunk := response.read(1024 * 1024):
            target.write(chunk)
    if temporary.stat().st_size == 0:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"A restrição ONS para {year}-{month:02d} retornou um arquivo vazio.")
    os.replace(temporary, output)
    return {
        "source_url": source_url,
        "year": year,
        "month": month,
        "downloaded_at": utc_now_iso(),
        "path": str(output),
        "size_bytes": output.stat().st_size,
        "sha256": sha256_file(output),
    }
