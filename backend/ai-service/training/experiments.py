"""Publish, query, restore and safely prune local experiment bundles."""
from __future__ import annotations

import argparse
import json
import subprocess
import time
from pathlib import Path

from training.config import default_artifact_dir, service_root
from training.experiment_store import (ExperimentStore, RegistryError, RECEIPT, canonical,
                                       digest, is_link, read_bundle)


def cleanup_local(directory: Path, store: ExperimentStore, *, apply: bool = False,
                  older_than_days: int = 30) -> dict:
    """Only a direct child of artifacts/experiments, after full remote verification.

    Run while training/serving processes that use this directory are stopped.
    A .pin file protects any bundle used by another process or checkout.
    """
    root = service_root().resolve()
    experiments = root / "artifacts" / "experiments"
    requested = Path(directory).absolute()
    if any(is_link(p) for p in (requested, *requested.parents)):
        raise RegistryError("Limpeza recusada: link/junction no caminho.")
    directory = requested.resolve(strict=True)
    if directory.parent != experiments.resolve() or not directory.is_dir():
        raise RegistryError("Limpeza limitada a filhos diretos de artifacts/experiments.")
    active = default_artifact_dir().resolve()
    if directory == active or directory in active.parents or active in directory.parents:
        raise RegistryError("Diretório do modelo ativo protegido.")
    if older_than_days < 0:
        raise RegistryError("Retenção deve ser não negativa.")
    manifest, files = read_bundle(directory)
    expected = set(files) | {RECEIPT}
    entries = list(directory.iterdir())
    if {p.name for p in entries} != expected or any(not p.is_file() or is_link(p) for p in entries):
        raise RegistryError("Conteúdo extra, .pin, subdiretório ou recibo ausente: limpeza recusada.")
    if max(p.stat().st_mtime for p in entries) > time.time() - older_than_days * 86400:
        raise RegistryError("Bundle ainda está dentro da retenção local.")
    # Fail closed if Git is unavailable or the directory is outside this checkout.
    try:
        tracked = subprocess.run(["git", "ls-files", "--", str(directory)], cwd=root,
                                 capture_output=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        raise RegistryError("Não foi possível verificar arquivos versionados pelo Git.") from None
    if tracked.strip():
        raise RegistryError("Limpeza recusada: há arquivos versionados pelo Git.")
    receipt = json.loads((directory / RECEIPT).read_text(encoding="utf-8"))
    if receipt.get("supabase_url") != store.url or receipt.get("bucket") != store.bucket:
        raise RegistryError("Recibo pertence a outro projeto/bucket.")
    row, _ = store.verify(receipt["run_id"])
    if row["manifest"] != manifest or receipt.get("manifest_sha256") != digest(canonical(manifest)):
        raise RegistryError("Bundle local diverge do backup remoto.")
    result = {"directory": str(directory), "run_id": row["id"],
              "bytes": sum(p.stat().st_size for p in entries), "deleted": False,
              "files": sorted(expected)}
    if apply:
        # Recheck immediately before deleting only enumerated files, never recursive rm.
        current, _ = read_bundle(directory)
        if current != manifest or {p.name for p in directory.iterdir()} != expected:
            raise RegistryError("Bundle mudou durante a verificação; limpeza cancelada.")
        for path in entries:
            if is_link(path):
                raise RegistryError("Bundle mudou durante a verificação; limpeza cancelada.")
        for path in entries:
            path.unlink()
        directory.rmdir()
        result["deleted"] = True
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, help="Carrega explicitamente credenciais do servidor.")
    commands = parser.add_subparsers(dest="command", required=True)
    publish = commands.add_parser("publish")
    publish.add_argument("directory", type=Path)
    listing = commands.add_parser("list")
    listing.add_argument("--limit", type=int, default=20)
    listing.add_argument("--offset", type=int, default=0)
    show = commands.add_parser("show")
    show.add_argument("run_id")
    pull = commands.add_parser("pull")
    pull.add_argument("run_id")
    pull.add_argument("destination", type=Path)
    cleanup = commands.add_parser("clean")
    cleanup.add_argument("directory", type=Path)
    cleanup.add_argument("--apply", action="store_true", help="Sem esta opção, apenas simula.")
    cleanup.add_argument("--older-than-days", type=int, default=30)
    args = parser.parse_args()
    if args.env_file:
        from dotenv import load_dotenv
        load_dotenv(args.env_file, override=False)
    try:
        with ExperimentStore.from_env() as store:
            if args.command == "publish":
                result = store.publish(args.directory)
            elif args.command == "list":
                result = store.list_runs(args.limit, args.offset)
            elif args.command == "show":
                result = store.get_run(args.run_id)
            elif args.command == "pull":
                row = store.pull(args.run_id, args.destination)
                result = {"run_id": row["id"], "destination": str(args.destination)}
            else:
                result = cleanup_local(args.directory, store, apply=args.apply,
                                       older_than_days=args.older_than_days)
    except (RegistryError, ValueError, KeyError, OSError) as exc:
        # Never print arbitrary HTTP error responses or credential-bearing exceptions.
        message = str(exc) if isinstance(exc, RegistryError) else "Falha local ou contrato remoto inválido; operação não concluída."
        parser.exit(2, message + "\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
