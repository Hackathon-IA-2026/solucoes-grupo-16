"""Private Supabase experiment registry; immutable, verified artifact bundles.

No credentials are persisted. A completed publication is a backup, not promotion.
Uses the Supabase REST/Storage APIs directly to avoid another SDK dependency tree.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID, NAMESPACE_URL, uuid5

import httpx

LEGACY_REQUIRED = {"model.txt", "metadata.json", "residual_quantiles.json", "validation_report.json"}
PROTOCOL_REQUIRED = {"metadata.json", "residual_quantiles.json", "final_evaluation_report.json",
                     "reserved_access_log.json", "protocol_manifest.json"}
ALLOWED = LEGACY_REQUIRED | PROTOCOL_REQUIRED | {"evaluation_report.json", "model.ubj"}
RECEIPT = ".supabase-publication.json"
MAX_FILE_BYTES = 64 * 1024 * 1024


class RegistryError(RuntimeError):
    """Sanitized error safe to display without leaking credentials or response bodies."""


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
                      allow_nan=False).encode("utf-8")


def is_link(path: Path) -> bool:
    return path.is_symlink() or path.is_junction()


def read_bundle(directory: Path) -> tuple[dict, dict[str, bytes]]:
    directory = Path(directory)
    if any(is_link(p) for p in (directory, *directory.parents)):
        raise RegistryError("Diretório de artefatos contém link/junction.")
    files = {}
    for name in sorted(ALLOWED):
        path = directory / name
        if is_link(path):
            raise RegistryError("Artefato contém link/junction.")
        if path.exists():
            if not path.is_file() or path.stat().st_size > MAX_FILE_BYTES:
                raise RegistryError("Artefato inválido ou acima de 64 MiB.")
            files[name] = path.read_bytes()
    try:
        metadata = json.loads(files["metadata.json"])
        schema = metadata.get("artifact_schema_version", "legacy-temporal-70-15-15")
        if schema not in {"legacy-temporal-70-15-15", "temporal-protocol-v1"}:
            raise RegistryError("Versão de artefato desconhecida.")
        required = LEGACY_REQUIRED if schema == "legacy-temporal-70-15-15" else PROTOCOL_REQUIRED
        model_name = metadata.get("model_file", "model.txt")
        if not required <= files.keys() or model_name not in files:
            raise RegistryError("Bundle incompleto: faltam artefatos obrigatórios.")
        if metadata["model_sha256"] != digest(files[model_name]):
            raise RegistryError("Hash do modelo difere do metadata.")
        if schema == "temporal-protocol-v1":
            if (metadata.get("calibration_sha256") != digest(files["residual_quantiles.json"])
                    or metadata.get("final_report_sha256") != digest(files["final_evaluation_report.json"])
                    or metadata.get("protocol_manifest_sha256")
                    != digest(canonical(json.loads(files["protocol_manifest.json"])))):
                raise RegistryError("Hashes de calibração ou avaliação final divergem do metadata.")
        for key in ("model_version", "target", "training_config", "metrics"):
            if key not in metadata and not (schema == "temporal-protocol-v1" and key == "metrics"):
                raise RegistryError(f"Metadata sem {key}.")
        canonical(metadata)
    except (ValueError, TypeError, KeyError):
        raise RegistryError("Metadata inválido.") from None
    manifest = {name: {"sha256": digest(data), "size_bytes": len(data)} for name, data in files.items()}
    return manifest, files


def write_receipt(directory: Path, value: dict) -> None:
    destination = directory / RECEIPT
    if is_link(destination):
        raise RegistryError("Recibo não pode ser um link.")
    # Same-directory atomic replacement; never follow an existing receipt link.
    with tempfile.NamedTemporaryFile(dir=directory, delete=False, suffix=".tmp") as stream:
        temporary = Path(stream.name)
        stream.write(canonical(value))
    try:
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


class ExperimentStore:
    def __init__(self, url: str, key: str, *, transport=None):
        parsed = urlparse(url)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or parsed.path not in ("", "/")):
            raise RegistryError("SUPABASE_URL deve ser uma origem HTTPS válida.")
        if not key or key.startswith("sb_publishable_"):
            raise RegistryError("Use SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY no servidor.")
        self.url = url.rstrip("/")
        self.bucket = "ml-experiments"
        headers = {"apikey": key}
        if not key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {key}"
        self.client = httpx.Client(base_url=self.url, headers=headers, timeout=60,
                                   follow_redirects=False, transport=transport)

    @classmethod
    def from_env(cls) -> "ExperimentStore":
        return cls(os.getenv("SUPABASE_URL", ""),
                   os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.client.close()

    def _request(self, method: str, path: str, *, allowed=(), **kwargs) -> httpx.Response:
        for attempt in range(3):
            try:
                response = self.client.request(method, path, **kwargs)
            except httpx.TransportError:
                if attempt == 2:
                    raise RegistryError("Supabase indisponível; arquivos locais preservados.") from None
            else:
                if response.is_success or response.status_code in allowed:
                    return response
                if response.status_code not in (408, 429, 500, 502, 503, 504) or attempt == 2:
                    raise RegistryError(f"Supabase retornou HTTP {response.status_code}; publicação não confirmada.")
            time.sleep(0.25 * 2**attempt)
        raise RegistryError("Supabase indisponível.")

    def list_runs(self, limit: int = 20, offset: int = 0) -> list[dict]:
        if not 1 <= limit <= 100 or offset < 0:
            raise RegistryError("Use limit entre 1 e 100 e offset não negativo.")
        return self._request("GET", "/rest/v1/ml_experiments", params={
            "select": "id,status,model_version,target,created_at,completed_at,metrics",
            "order": "created_at.desc", "limit": limit, "offset": offset,
        }).json()

    def get_run(self, run_id: str) -> dict:
        run_id = str(UUID(run_id))
        rows = self._request("GET", "/rest/v1/ml_experiments",
                             params={"id": f"eq.{run_id}", "select": "*"}).json()
        if len(rows) != 1:
            raise RegistryError("Experimento não encontrado.")
        row = rows[0]
        manifest = row["manifest"]
        if not isinstance(manifest, dict) or "metadata.json" not in manifest or not manifest.keys() <= ALLOWED:
            raise RegistryError("Manifesto remoto incompatível.")
        for item in manifest.values():
            if (not isinstance(item, dict) or not isinstance(item.get("sha256"), str)
                    or not re.fullmatch(r"[0-9a-f]{64}", item["sha256"])
                    or type(item.get("size_bytes")) is not int
                    or not 0 <= item["size_bytes"] <= MAX_FILE_BYTES):
                raise RegistryError("Manifesto remoto inválido.")
        if digest(canonical(manifest)) != row["manifest_sha256"]:
            raise RegistryError("Hash do manifesto remoto inválido.")
        if str(uuid5(NAMESPACE_URL, "climagrid-ml:" + row["manifest_sha256"])) != run_id:
            raise RegistryError("Identidade do bundle remoto inválida.")
        return row

    def _object_path(self, run_id: str, name: str) -> str:
        return f"/storage/v1/object/{self.bucket}/{run_id}/{name}"

    def verify(self, run_id: str, *, require_complete: bool = True) -> tuple[dict, dict[str, bytes]]:
        run_id = str(UUID(run_id))
        row = self.get_run(run_id)
        if require_complete and row["status"] != "complete":
            raise RegistryError("Publicação remota incompleta.")
        files = {}
        for name, entry in row["manifest"].items():
            data = self._request("GET", self._object_path(run_id, name)).content
            if len(data) != entry["size_bytes"] or digest(data) != entry["sha256"]:
                raise RegistryError("Integridade do artefato remoto não confirmada.")
            files[name] = data
        return row, files

    def publish(self, directory: Path) -> dict:
        directory = Path(directory)
        manifest, files = read_bundle(directory)
        fingerprint = digest(canonical(manifest))
        run_id = str(uuid5(NAMESPACE_URL, "climagrid-ml:" + fingerprint))
        metadata = json.loads(files["metadata.json"])
        row = {"id": run_id, "status": "uploading", "model_family": metadata.get("algorithm", "lightgbm"),
               "model_version": metadata["model_version"], "target": metadata["target"],
               "parameters": metadata.get("lightgbm_params", metadata["training_config"]),
               "metrics": metadata.get("metrics", {}), "metadata": metadata,
               "manifest": manifest, "manifest_sha256": fingerprint}
        # Ignore duplicate rows: retries must not regress a complete run to uploading.
        self._request("POST", "/rest/v1/ml_experiments", params={"on_conflict": "id"},
                      headers={"Prefer": "resolution=ignore-duplicates,return=minimal"}, json=row)
        existing = self.get_run(run_id)
        if existing["manifest"] != manifest or existing["metadata"] != metadata:
            raise RegistryError("Conflito com publicação existente.")
        for name, data in files.items():
            path = self._object_path(run_id, name)
            current = self._request("GET", path, allowed=(400, 404))
            if not current.is_success:
                # Supabase may report object-not-found as 400. Never overwrite objects.
                self._request("POST", path, content=data, allowed=(400, 409),
                    headers={"Content-Type": "application/octet-stream", "x-upsert": "false"})
                current = self._request("GET", path)
            if digest(current.content) != manifest[name]["sha256"]:
                raise RegistryError("Objeto remoto divergente; não foi sobrescrito.")
        self.verify(run_id, require_complete=False)
        self._request("PATCH", "/rest/v1/ml_experiments", params={"id": f"eq.{run_id}", "status": "eq.uploading"},
                      json={"status": "complete", "completed_at": datetime.now(timezone.utc).isoformat()})
        completed = self.get_run(run_id)
        if completed["status"] != "complete":
            raise RegistryError("Conclusão da publicação não confirmada.")

        if metadata.get("artifact_schema_version") == "temporal-protocol-v1" and "protocol_manifest.json" in files:
            protocol_manifest = json.loads(files["protocol_manifest.json"])
            proto_row = {
                "manifest_sha256": digest(canonical(protocol_manifest)),
                "protocol_version": protocol_manifest["protocol_version"],
                "state": protocol_manifest["state"],
                "manifest": protocol_manifest,
                "assignments_sha256": protocol_manifest.get("assignments_sha256"),
                "model_sha256": protocol_manifest.get("model_sha256"),
                "calibration_sha256": protocol_manifest.get("calibration_sha256"),
                "final_report_sha256": protocol_manifest.get("final_report_sha256")
            }
            self._request("POST", "/rest/v1/ml_temporal_protocols", params={"on_conflict": "manifest_sha256"},
                          headers={"Prefer": "resolution=ignore-duplicates,return=minimal"}, json=proto_row)

            if "reserved_access_log.json" in files:
                access_logs = json.loads(files["reserved_access_log.json"])
                for log_entry in access_logs:
                    log_row = {
                        "protocol_version": protocol_manifest["protocol_version"],
                        "protocol_manifest_sha256": proto_row["manifest_sha256"],
                        "block_role": log_entry["role"],
                        "actor": log_entry["actor"],
                        "purpose": log_entry["purpose"],
                        "accessed_at": log_entry["accessed_at_utc"]
                    }
                    self._request("POST", "/rest/v1/ml_temporal_access_log",
                                  headers={"Prefer": "return=minimal"}, json=log_row)
        receipt = {"run_id": run_id, "supabase_url": self.url, "bucket": self.bucket,
                   "manifest_sha256": fingerprint}
        write_receipt(directory, receipt)
        return receipt

    def pull(self, run_id: str, destination: Path) -> dict:
        destination = Path(destination).absolute()
        if destination.exists() or any(is_link(p) for p in (destination, *destination.parents)):
            raise RegistryError("Destino deve ser novo e sem links/junctions.")
        row, files = self.verify(run_id)
        destination.parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(dir=destination.parent, prefix=".ml-download-"))
        try:
            for name, data in files.items():
                (staging / name).write_bytes(data)
            read_bundle(staging)
            write_receipt(staging, {"run_id": row["id"], "supabase_url": self.url,
                          "bucket": self.bucket, "manifest_sha256": row["manifest_sha256"]})
            staging.replace(destination)
        except BaseException:
            shutil.rmtree(staging, ignore_errors=True)
            raise
        return row
