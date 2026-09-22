"""Discover and download the current SIGA CSV through ANEEL's CKAN API."""
from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

from ingestion.common.io import sha256_file, utc_now_iso


SIGA_PACKAGE_API = "https://dadosabertos.aneel.gov.br/api/3/action/package_show?id=siga-sistema-de-informacoes-de-geracao-da-aneel"


def discover_siga_csv(api_url: str = SIGA_PACKAGE_API) -> str:
    request = Request(api_url, headers={"User-Agent": "ClimaGrid/1.0"})
    with urlopen(request, timeout=60) as response:  # noqa: S310 - fixed/explicit URL
        payload = json.load(response)
    if not payload.get("success"):
        raise RuntimeError("A API da ANEEL não retornou o pacote SIGA.")
    resources = payload["result"].get("resources", [])
    csv_resources = [item for item in resources if str(item.get("format", "")).upper() == "CSV"]
    if not csv_resources:
        raise RuntimeError("Nenhum recurso CSV foi encontrado no pacote SIGA.")
    csv_resources.sort(key=lambda item: str(item.get("last_modified") or item.get("created") or ""), reverse=True)
    return str(csv_resources[0]["url"])


def download_siga(output: Path, *, source_url: str | None = None) -> dict:
    url = source_url or discover_siga_csv()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".part")
    request = Request(url, headers={"User-Agent": "ClimaGrid/1.0"})
    with urlopen(request, timeout=180) as response, temporary.open("wb") as target:  # noqa: S310
        while chunk := response.read(1024 * 1024):
            target.write(chunk)
    if temporary.stat().st_size == 0:
        temporary.unlink(missing_ok=True)
        raise RuntimeError("O download do SIGA retornou um arquivo vazio.")
    os.replace(temporary, output)
    return {
        "source_url": url,
        "downloaded_at": utc_now_iso(),
        "path": str(output),
        "size_bytes": output.stat().st_size,
        "sha256": sha256_file(output),
    }

