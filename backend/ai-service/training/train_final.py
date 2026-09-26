"""CLI for the frozen point-model job."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import pandas as pd
from training.build_dataset import TabularDatasetAdapter, prepare_snapshot
from training.config import load_config
from training.protocol import ProtocolManifest
from training.protocol_jobs import train_frozen_model


def main() -> None:
    parser = argparse.ArgumentParser(description="Treina o candidato congelado sem abrir reservas.")
    for name in ("input", "assignments", "protocol", "config", "tuning", "artifacts", "output-protocol"):
        parser.add_argument(f"--{name}", required=True, type=Path)
    args = parser.parse_args()
    config = load_config(args.config)
    data, _ = prepare_snapshot(TabularDatasetAdapter().load(args.input), config)
    assignments = pd.read_parquet(args.assignments) if args.assignments.suffix == ".parquet" else pd.read_csv(args.assignments)
    updated = train_frozen_model(data, assignments, ProtocolManifest.load(args.protocol), config,
                                 json.loads(args.tuning.read_text(encoding="utf-8")), args.artifacts)
    updated.write(args.output_protocol)
    print(json.dumps({"state": updated.state.value, "model_sha256": updated.model_sha256}, indent=2))


if __name__ == "__main__":
    main()
