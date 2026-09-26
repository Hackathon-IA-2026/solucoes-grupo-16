import json
import subprocess
from pathlib import Path

import httpx
import pytest

from training.experiment_store import (ExperimentStore, RegistryError, RECEIPT,
                                       digest, read_bundle)
from training import experiments


class SupabaseStub:
    def __init__(self):
        self.rows = {}
        self.objects = {}
        self.uploads = 0
        self.fail_upload = False
        self.headers = []

    def __call__(self, request):
        self.headers.append(request.headers)
        path = request.url.path
        if path == "/rest/v1/ml_experiments":
            if request.method == "POST":
                row = json.loads(request.content)
                self.rows.setdefault(row["id"], row)
                return httpx.Response(201)
            identity = request.url.params.get("id", "").removeprefix("eq.")
            if request.method == "PATCH":
                if self.rows[identity]["status"] == "uploading":
                    self.rows[identity].update(json.loads(request.content))
                return httpx.Response(204)
            return httpx.Response(200, json=[self.rows[identity]] if identity in self.rows
                                  else ([] if identity else list(self.rows.values())))
        if path.startswith("/storage/v1/object/ml-experiments/"):
            if request.method == "POST":
                if self.fail_upload:
                    return httpx.Response(403, text="secret server diagnostics")
                self.uploads += 1
                if path in self.objects:
                    return httpx.Response(409)
                self.objects[path] = request.content
                return httpx.Response(200, json={"Key": path})
            if path not in self.objects:
                return httpx.Response(400, json={"message": "Object not found"})
            return httpx.Response(200, content=self.objects[path])
        raise AssertionError((request.method, path))


@pytest.fixture
def remote():
    server = SupabaseStub()
    with ExperimentStore("https://example.supabase.co", "sb_secret_test",
                         transport=httpx.MockTransport(server)) as store:
        yield store, server


def bundle(directory):
    directory.mkdir(parents=True)
    model = b"model native lightgbm fixture"
    (directory / "model.txt").write_bytes(model)
    (directory / "metadata.json").write_text(json.dumps({
        "model_sha256": digest(model), "model_version": "test-v1",
        "target": "geracao_referencia_mw", "training_config": {"lightgbm": {"num_leaves": 31}},
        "metrics": {"hybrid_test": {"overall": {"mae_mw": 1.0}}}, "approved": False,
    }), encoding="utf-8")
    for name in ("residual_quantiles.json", "validation_report.json"):
        (directory / name).write_text("{}", encoding="utf-8")
    return directory


def test_publish_idempotent_list_and_restore(remote, tmp_path):
    store, server = remote
    source = bundle(tmp_path / "source")
    receipt = store.publish(source)
    assert store.publish(source) == receipt
    assert server.uploads == 4
    assert store.list_runs()[0]["status"] == "complete"
    assert store.get_run(receipt["run_id"])["metadata"]["approved"] is False
    destination = tmp_path / "restored"
    store.pull(receipt["run_id"], destination)
    assert read_bundle(source) == read_bundle(destination)
    assert all("authorization" not in headers for headers in server.headers)
    assert "sb_secret" not in (source / RECEIPT).read_text()
    with pytest.raises(RegistryError, match="Destino"):
        store.pull(receipt["run_id"], destination)


def test_partial_upload_preserved_and_retry_resumes(remote, tmp_path):
    store, server = remote
    source = bundle(tmp_path / "source")
    server.fail_upload = True
    with pytest.raises(RegistryError, match="HTTP 403") as error:
        store.publish(source)
    assert "secret server" not in str(error.value)
    assert not (source / RECEIPT).exists()
    assert next(iter(server.rows.values()))["status"] == "uploading"
    assert (source / "model.txt").exists()
    server.fail_upload = False
    receipt = store.publish(source)
    assert len(server.rows) == 1
    assert store.get_run(receipt["run_id"])["status"] == "complete"


def test_corrupt_remote_cannot_be_restored_or_overwritten(remote, tmp_path):
    store, server = remote
    source = bundle(tmp_path / "source")
    receipt = store.publish(source)
    path = next(key for key in server.objects if key.endswith("model.txt"))
    server.objects[path] = b"corruption"
    with pytest.raises(RegistryError, match="Integridade"):
        store.pull(receipt["run_id"], tmp_path / "restore")
    assert not (tmp_path / "restore").exists()
    with pytest.raises(RegistryError, match="divergente"):
        store.publish(source)
    assert server.objects[path] == b"corruption"


def test_new_evaluation_creates_new_immutable_bundle(remote, tmp_path):
    store, server = remote
    source = bundle(tmp_path / "source")
    before = store.publish(source)
    (source / "evaluation_report.json").write_text('{"mae": 1}')
    after = store.publish(source)
    assert before["run_id"] != after["run_id"]
    assert len(server.rows) == 2


def test_local_model_hash_mismatch_fails_before_network(remote, tmp_path):
    store, server = remote
    source = bundle(tmp_path / "source")
    (source / "model.txt").write_text("wrong")
    with pytest.raises(RegistryError, match="Hash"):
        store.publish(source)
    assert not server.rows


def test_reject_remote_manifest_traversal(remote, tmp_path):
    store, server = remote
    receipt = store.publish(bundle(tmp_path / "source"))
    server.rows[receipt["run_id"]]["manifest"]["../escape"] = {"sha256": "a" * 64, "size_bytes": 1}
    with pytest.raises(RegistryError, match="Manifesto"):
        store.pull(receipt["run_id"], tmp_path / "restore")


@pytest.fixture
def cleanup_bundle(remote, tmp_path, monkeypatch):
    root = tmp_path / "repo"
    directory = bundle(root / "artifacts" / "experiments" / "run-1")
    subprocess.run(["git", "init", "--quiet", str(root)], check=True)
    monkeypatch.setattr(experiments, "service_root", lambda: root)
    monkeypatch.setattr(experiments, "default_artifact_dir", lambda: root / "artifacts/global/v1")
    store, _ = remote
    store.publish(directory)
    return directory


def test_cleanup_dry_run_then_apply(remote, cleanup_bundle):
    store, _ = remote
    result = experiments.cleanup_local(cleanup_bundle, store, older_than_days=0)
    assert not result["deleted"] and cleanup_bundle.exists()
    result = experiments.cleanup_local(cleanup_bundle, store, apply=True, older_than_days=0)
    assert result["deleted"] and not cleanup_bundle.exists()


@pytest.mark.parametrize("guard", ["pin", "tracked", "changed", "active", "retention", "remote"])
def test_cleanup_guards(remote, cleanup_bundle, monkeypatch, guard):
    store, server = remote
    if guard == "pin":
        (cleanup_bundle / ".pin").touch()
    elif guard == "tracked":
        subprocess.run(["git", "add", "model.txt"], cwd=cleanup_bundle, check=True)
    elif guard == "changed":
        (cleanup_bundle / "validation_report.json").write_text('{"changed": true}')
    elif guard == "active":
        monkeypatch.setattr(experiments, "default_artifact_dir", lambda: cleanup_bundle)
    elif guard == "remote":
        server.objects[next(iter(server.objects))] = b"bad"
    with pytest.raises(RegistryError):
        experiments.cleanup_local(cleanup_bundle, store, apply=True,
                                  older_than_days=30 if guard == "retention" else 0)
    assert (cleanup_bundle / "model.txt").exists()


def test_cleanup_outside_experiments_refused(remote, tmp_path):
    with pytest.raises(RegistryError, match="filhos diretos"):
        experiments.cleanup_local(bundle(tmp_path / "outside"), remote[0], apply=True)


def test_auth_and_url_validation():
    for url, key in [("http://example.com", "sb_secret_x"),
                     ("https://user:pass@example.com", "sb_secret_x"),
                     ("https://example.com", "sb_publishable_x"),
                     ("https://example.com", "")]:
        with pytest.raises(RegistryError):
            ExperimentStore(url, key)
    server = SupabaseStub()
    with ExperimentStore("https://example.com", "legacy-jwt", transport=httpx.MockTransport(server)) as store:
        store.list_runs()
    assert server.headers[0]["authorization"] == "Bearer legacy-jwt"


def test_training_cli_publishes_final_report(synthetic_frame, tmp_path, monkeypatch, remote):
    import sys
    from training import train as trainer
    source = tmp_path / "input.csv"
    synthetic_frame.to_csv(source, index=False)
    artifact_dir = tmp_path / "training-output"
    store, server = remote
    # Main opens two short-lived clients; prevent fixture client closure until assertions.
    monkeypatch.setattr(ExperimentStore, "from_env", classmethod(lambda cls: store))
    monkeypatch.setattr(store.client, "close", lambda: None)
    monkeypatch.setattr(sys, "argv", ["train", "--input", str(source), "--target", "geracao_referencia_mw",
        "--artifacts", str(artifact_dir), "--processed", str(tmp_path / "hourly.csv"), "--tracking", "supabase"])
    trainer.main()
    assert len(server.rows) == 1
    row = next(iter(server.rows.values()))
    assert row["status"] == "complete"
    remote_report = server.objects[f"/storage/v1/object/ml-experiments/{row['id']}/validation_report.json"]
    assert remote_report == (artifact_dir / "validation_report.json").read_bytes()
