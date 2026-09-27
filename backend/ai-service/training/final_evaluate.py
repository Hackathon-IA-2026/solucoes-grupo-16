"""CLI that consumes a final-test reservation once."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import pandas as pd
from training.build_dataset import TabularDatasetAdapter, prepare_snapshot
from training.config import load_config
from training.protocol import ProtocolManifest
from training.protocol_jobs import evaluate_final_once, open_reserved_block


def main() -> None:
    parser = argparse.ArgumentParser(description="Consome e avalia o teste final congelado.")
    for name in ("input", "assignments", "protocol", "config", "artifacts", "output-protocol"):
        parser.add_argument(f"--{name}", required=True, type=Path)
    parser.add_argument("--actor", required=True)
    args = parser.parse_args()
    config = load_config(args.config)
    protocol = ProtocolManifest.load(args.protocol)
    protocol.validate_reproducibility(training_config=config.serializable())
    protocol = open_reserved_block(protocol, args.artifacts, role="final_test",
                                   actor=args.actor, purpose="final_acceptance_evaluation")
    data, _ = prepare_snapshot(TabularDatasetAdapter().load(args.input), config)
    assignments = pd.read_parquet(args.assignments) if args.assignments.suffix == ".parquet" else pd.read_csv(args.assignments)
    updated, report = evaluate_final_once(data, assignments, protocol, config,
                                          args.artifacts, actor=args.actor,
                                          access_already_recorded=True)
    updated.write(args.output_protocol)
    print(json.dumps({"state": updated.state.value,
                      "scientifically_approved": report["scientifically_approved"]}, indent=2))


if __name__ == "__main__":
    main()
