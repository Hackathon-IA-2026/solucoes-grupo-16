FROM scratch

LABEL org.opencontainers.image.title="ClimaGrid historical runtime data" \
      org.opencontainers.image.description="Validated January 2024 ONS + ERA5 replay snapshot"

COPY processed/historical/observations.parquet /service/data/processed/historical/observations.parquet
COPY processed/reference/plant_locations.parquet /service/data/processed/reference/plant_locations.parquet
COPY processed/reference/pwf_bus_mapping.parquet /service/data/processed/reference/pwf_bus_mapping.parquet
