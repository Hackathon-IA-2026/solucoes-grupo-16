#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: DOCKER_REPO=<docker-hub-user> $0 [--push|--load]"
}

mode="${1:---push}"
if [[ "$mode" != "--push" && "$mode" != "--load" ]]; then
  usage
  exit 2
fi

if [[ -z "${DOCKER_REPO:-}" ]]; then
  usage
  exit 2
fi

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repository_root=$(cd "$script_dir/.." && pwd)
data_root="$repository_root/backend/ai-service/data"
data_tag=$(tr -d '\r\n ' < "$script_dir/historical-data-version.txt")
image="docker.io/${DOCKER_REPO}/climagrid-historical-data:${data_tag}"

required_files=(
  "processed/historical/observations.parquet"
  "processed/reference/plant_locations.parquet"
  "processed/reference/pwf_bus_mapping.parquet"
)

for relative_path in "${required_files[@]}"; do
  if [[ ! -s "$data_root/$relative_path" ]]; then
    echo "Missing or empty runtime data file: $data_root/$relative_path" >&2
    exit 1
  fi
done

(
  cd "$data_root"
  sha256sum --check "$script_dir/historical-data.sha256"
)

output_flag="--push"
if [[ "$mode" == "--load" ]]; then
  output_flag="--load"
fi

echo "Publishing validated historical data as $image"
docker buildx build \
  --platform linux/amd64 \
  --file "$script_dir/historical-data.Dockerfile" \
  --tag "$image" \
  "$output_flag" \
  "$data_root"

echo "Historical data image ready: $image"
