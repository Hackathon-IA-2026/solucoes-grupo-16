from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from ingestion.common.io import sha256_file
from ingestion.ons.observed import OBSERVED, REFERENCE, build_observed_snapshot, keyed
from training.observed_generation import evaluate_files, prepare_files
from training.observed_metrics import evaluate_observed, metrics, render_report


@pytest.fixture
def sources():
    # The last local hour belongs to the following UTC month.
    times = pd.date_range("2025-09-30 22:00", periods=3, freq="h")
    generation = pd.DataFrame({"id_ons": ["u1"] * 3, "id_subsistema": ["NE"] * 3,
                               "nom_tipousina": ["EOLIELÉTRICA"] * 3,
                               "din_instante": times, "val_geracao": [0., 20., 40.]})
    restriction = pd.DataFrame({"id_ons": ["u1"] * 6,
                                "din_instante": pd.date_range(times[0], periods=6, freq="30min"),
                                "val_geracao": [1., 1., 21., 21., 41., 41.],
                                "val_geracaoreferencia": [50., 50., 120., 120., 80., 80.],
                                "val_disponibilidade": [90., 90., 80., 80., 90., 90.],
                                "cod_razaorestricao": ["", "", "REL", "REL", "", ""]})
    weather = pd.DataFrame({"usina_id": ["u1"] * 3,
                            "timestamp_utc": times.tz_localize("America/Sao_Paulo").tz_convert("UTC"),
                            "u100": [8.] * 3, "v100": [1.] * 3,
                            "temperature_2m": [298.] * 3, "surface_pressure": [101000.] * 3})
    catalog = pd.DataFrame({"id_ons": ["u1"], "capacidade_instalada_mw": [100.]})
    return generation, restriction, weather, catalog


def test_canonical_source_is_not_overwritten_and_high_reference_is_retained(sources):
    snapshot, report = build_observed_snapshot(*sources)
    assert snapshot[OBSERVED].tolist() == [0, 20, 40]
    assert snapshot[REFERENCE].tolist() == [50, 120, 80]
    assert snapshot.geracao_verificada_restricao_mw.tolist() == [1, 21, 41]
    assert snapshot.timestamp_utc.iloc[0] == pd.Timestamp("2025-10-01T01:00:00Z")
    assert report["reference_above_capacity_rows_retained"] == 1
    assert report["source_reconciliation"]["mae_mw"] == 1
    assert report["target_based_filtering"] is False


def test_missing_half_hour_never_fabricates_reference_or_drops_observed(sources):
    g, r, w, c = sources
    snapshot, report = build_observed_snapshot(g, r.iloc[1:], w, c)
    assert len(snapshot) == 3
    assert pd.isna(snapshot[REFERENCE].iloc[0])
    assert report["restriction"]["incomplete_hours"] == 1


def test_invalid_half_hour_not_averaged_away(sources):
    g, r, w, c = sources
    r.loc[0, "val_geracaoreferencia"] = np.nan
    snapshot, _ = build_observed_snapshot(g, r, w, c)
    assert pd.isna(snapshot[REFERENCE].iloc[0])


def test_availability_out_of_range_does_not_select_primary_cohort(sources):
    g, r, w, c = sources
    r["val_disponibilidade"] = 200.
    snapshot, report = build_observed_snapshot(g, r, w, c)
    assert len(snapshot) == 3
    assert snapshot.disponibilidade.eq(2.).all()
    assert report["availability_outside_0_1_rows_retained"] == 3


@pytest.mark.parametrize("side", ["generation", "restriction", "weather"])
def test_conflicting_duplicate_fails(sources, side):
    g, r, w, c = sources
    if side == "generation":
        g = pd.concat([g, g.iloc[[0]].assign(val_geracao=999)], ignore_index=True)
    elif side == "restriction":
        r = pd.concat([r, r.iloc[[0]].assign(val_geracao=999)], ignore_index=True)
    else:
        w = pd.concat([w, w.iloc[[0]].assign(u100=9)], ignore_index=True)
    with pytest.raises(ValueError, match="conflitantes|duplicadas"):
        build_observed_snapshot(g, r, w, c)


def test_invalid_climate_exclusion_is_reported(sources):
    g, r, w, c = sources
    w.loc[0, "u100"] = np.inf
    snapshot, report = build_observed_snapshot(g, r, w, c)
    assert len(snapshot) == 2
    assert report["join"]["invalid_weather_rows"] == 1
    assert report["join"]["unmatched_by_plant"] == {"u1": 1}


def test_timezone_is_required_and_offset_keys_are_normalized(sources):
    w = sources[2]
    naive = w.assign(timestamp_utc=w.timestamp_utc.dt.tz_localize(None))
    with pytest.raises(ValueError, match="timezone"):
        keyed(naive, "weather")
    local = w.assign(timestamp_utc=w.timestamp_utc.dt.tz_convert("America/Sao_Paulo"))
    pd.testing.assert_frame_equal(keyed(w, "utc"), keyed(local, "local"))


def test_paired_metrics_use_identical_keys_both_targets_and_ignore_embedded_target(sources):
    snapshot, _ = build_observed_snapshot(*sources)
    predictions = snapshot[["usina_id", "timestamp_utc"]].assign(prediction_mw=[10., 30., 40.], target_mw=999.)
    paired, report = evaluate_observed(predictions, snapshot, ["prediction_mw"])
    observed = report["metrics"][OBSERVED]
    reference = report["metrics"][REFERENCE]
    assert observed["cohort"] == reference["cohort"] == report["cohort"]
    assert observed["models"]["prediction_mw"]["plant_hour"]["wape"] == pytest.approx(20 / 60)
    assert reference["models"]["prediction_mw"]["plant_hour"]["wape"] == pytest.approx(170 / 250)
    assert paired[OBSERVED].eq(snapshot[OBSERVED]).all()
    assert "target_mw" not in paired
    assert report["restriction_sensitivity"]["recorded"][OBSERVED]["cohort"]["rows"] == 1
    assert "geracao_verificada_mw" in render_report(report)


def test_missing_reference_reported_and_same_cohort_used(sources):
    snapshot, _ = build_observed_snapshot(*sources)
    snapshot.loc[1, REFERENCE] = np.nan
    predictions = snapshot[["usina_id", "timestamp_utc"]].assign(prediction_mw=[10., 30., 40.])
    paired, report = evaluate_observed(predictions, snapshot, ["prediction_mw"])
    assert len(paired) == 2
    assert report["coverage"]["invalid_reasons_overlap"][f"nonfinite_{REFERENCE}"] == 1
    assert report["metrics"][OBSERVED]["cohort"] == report["metrics"][REFERENCE]["cohort"]


def test_zero_target_and_spatial_error_cancellation():
    zeros = metrics(pd.Series([0., 0.]), pd.Series([1., 2.]))
    assert zeros["wape"] is None
    assert zeros["mape_nonzero"] is None
    assert zeros["mae_mw"] == 1.5
    assert zeros["zero_target_rows_excluded_from_percentage_metrics"] == 2
    snapshot = pd.DataFrame({"usina_id": ["a", "b"], "timestamp_utc": [pd.Timestamp("2025-01-01T00:00Z")] * 2,
                             OBSERVED: [10., 20.], REFERENCE: [10., 20.]})
    predictions = snapshot[["usina_id", "timestamp_utc"]].assign(prediction_mw=[20., 10.])
    _, report = evaluate_observed(predictions, snapshot, ["prediction_mw"])
    scores = report["metrics"][OBSERVED]["models"]["prediction_mw"]
    assert scores["hourly_grid_total"]["wape"] == 0
    assert scores["plant_hour"]["wape"] == pytest.approx(20 / 30)


def test_target_cannot_be_submitted_as_prediction(sources):
    snapshot, _ = build_observed_snapshot(*sources)
    with pytest.raises(ValueError, match="Target"):
        evaluate_observed(snapshot, snapshot, [OBSERVED])


def materialize(tmp_path, sources):
    paths = []
    for name, frame in zip(["generation", "restriction", "weather", "catalog"], sources):
        path = tmp_path / f"{name}.parquet"
        frame.to_parquet(path, index=False)
        paths.append(path)
    return prepare_files([paths[0]], [paths[1]], [paths[2]], paths[3], tmp_path / "snapshot")


def test_file_pipeline_hashes_sample_json_and_no_overwrite(tmp_path, sources):
    snapshot_report = materialize(tmp_path, sources)
    assert snapshot_report["raw_sample"]["all_match"]
    assert snapshot_report["raw_sample"]["rows"] == 3
    snapshot = pd.read_parquet(snapshot_report["snapshot"]["path"])
    predictions = snapshot[["usina_id", "timestamp_utc"]].assign(prediction_mw=[10., 30., 40.])
    predictions_path, model = tmp_path / "predictions.parquet", tmp_path / "model.txt"
    predictions.to_parquet(predictions_path, index=False)
    model.write_text("test-only frozen model", encoding="utf-8")
    kwargs = dict(predictions_path=predictions_path, snapshot_manifests=[tmp_path / "snapshot/snapshot_manifest.json"],
                  model_path=model, expected_predictions_sha256=sha256_file(predictions_path),
                  expected_model_sha256=sha256_file(model), columns=["prediction_mw"], output_dir=tmp_path / "evaluation")
    report = evaluate_files(**kwargs)
    assert report["frozen_artifacts_verified"]
    manifest = json.loads((tmp_path / "evaluation/observed_generation_manifest.json").read_text())
    for output in manifest["outputs"]:
        assert sha256_file(Path(output["path"])) == output["sha256"]
    json.loads((tmp_path / "evaluation/observed_generation_report.json").read_text(),
               parse_constant=lambda value: pytest.fail(f"JSON não finito: {value}"))
    with pytest.raises(FileExistsError):
        evaluate_files(**kwargs)
    kwargs["output_dir"] = tmp_path / "tampered"
    model.write_text("modified", encoding="utf-8")
    with pytest.raises(ValueError, match="SHA-256"):
        evaluate_files(**kwargs)
    assert not kwargs["output_dir"].exists()


def test_sample_covers_months_and_matches_30_raw_values():
    from training.observed_generation import raw_sample
    times = pd.date_range("2024-10-01", periods=365, freq="D")
    raw = pd.DataFrame({"id_ons": "a", "id_subsistema": "NE", "nom_tipousina": "EOL",
                        "din_instante": times, "val_geracao": np.arange(365, dtype=float)})
    snapshot = pd.DataFrame({"usina_id": "a", "timestamp_utc": times.tz_localize("America/Sao_Paulo").tz_convert("UTC"),
                             OBSERVED: raw.val_geracao})
    sample = raw_sample(snapshot, raw)
    assert len(sample) == 30
    assert sample.timestamp_utc.dt.month.nunique() == 12
    assert sample.matches_raw.all()


@pytest.mark.parametrize("complete", [False, True])
def test_collection_enforces_location_gate_and_includes_next_utc_month(tmp_path, monkeypatch, sources, complete):
    from ingestion.era5 import cds_client, extract_points
    from ingestion.plants import catalog as catalog_module
    from training.observed_generation import collect_months

    root = tmp_path / "data"
    (root / "raw/siga").mkdir(parents=True)
    (root / "raw/ons/year=2025/month=09").mkdir(parents=True)
    (root / "raw/siga/siga.csv").write_text("fixture", encoding="utf-8")
    (root / "raw/ons/relacionamento_usina_conjunto.parquet").write_bytes(b"fixture")
    g, r, w, c = sources
    g.to_parquet(root / "raw/ons/year=2025/month=09/GERACAO_USINA-2_2025_09.parquet")
    r.to_parquet(root / "raw/ons/year=2025/month=09/RESTRICAO_COFF_EOLICA_2025_09.parquet")
    c = c.assign(usina_id="u1", latitude=-5., longitude=-40., match_status="matched" if complete else "unresolved")
    for name in ("load_ons_catalog", "load_ons_membership", "load_siga_catalog", "expand_ons_groups"):
        monkeypatch.setattr(catalog_module, name, lambda *a, **kw: c)
    monkeypatch.setattr(catalog_module, "reconcile_catalog", lambda *a, **kw: (c, {"plant_coverage": float(complete)}))
    requests = []
    def download(request, *a, **kw):
        requests.append(request)
    monkeypatch.setattr(cds_client, "download_month", download)
    def extract(raw, catalog, output, manifest, **kwargs):
        output.parent.mkdir(parents=True, exist_ok=True)
        # This fixture's local Sep30 hours occur only in October UTC.
        frame = w if "month=10" in str(output) else w.iloc[:0]
        frame.to_parquet(output)
    monkeypatch.setattr(extract_points, "extract_file", extract)
    out = tmp_path / "collection"
    if not complete:
        with pytest.raises(ValueError, match="95%"):
            collect_months("2025-09", "2025-09", root, out)
        assert not requests
        report = json.loads((out / "collection_report.json").read_text())
        assert report["status"] == "blocked"
        assert report["unlocated_or_partial_plants"] == ["u1"]
    else:
        report = collect_months("2025-09", "2025-09", root, out)
        assert report["status"] == "completed"
        assert [(req.year, req.month) for req in requests] == [(2025, 9), (2025, 10)]
        assert "01" in requests[-1].payload["day"]
        assert requests[-1].expected_hours == 744
        assert report["cohort"]["rows"] == 3


def test_tampered_source_rejected_before_evaluation(tmp_path, sources):
    materialize(tmp_path, sources)
    snapshot_path = tmp_path / "snapshot/observed_generation_snapshot.parquet"
    snapshot = pd.read_parquet(snapshot_path)
    p = tmp_path / "predictions.parquet"
    snapshot[["usina_id", "timestamp_utc"]].assign(prediction_mw=1.).to_parquet(p)
    model = tmp_path / "model.txt"
    model.write_text("fixture", encoding="utf-8")
    (tmp_path / "generation.parquet").write_bytes(b"tampered")
    with pytest.raises(ValueError, match="SHA-256"):
        evaluate_files(predictions_path=p, snapshot_manifests=[tmp_path / "snapshot/snapshot_manifest.json"],
                       model_path=model, expected_predictions_sha256=sha256_file(p),
                       expected_model_sha256=sha256_file(model), columns=["prediction_mw"], output_dir=tmp_path / "eval")
    assert not (tmp_path / "eval").exists()
