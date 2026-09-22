"""Manifest persistence and idempotency checks."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ingestion.common.io import atomic_write_json, sha256_file


def read_manifest(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def is_completed(path: Path, request_hash: str, output: Path) -> bool:
    manifest = read_manifest(path)
    structurally_complete = bool(
        manifest
        and manifest.get("status") == "completed"
        and manifest.get("request_hash") == request_hash
        and output.exists()
    )
    if not structurally_complete:
        return False
    expected_checksum = manifest.get("sha256")
    return not expected_checksum or sha256_file(output) == expected_checksum


def write_manifest(path: Path, manifest: dict[str, Any]) -> None:
    atomic_write_json(path, manifest)
