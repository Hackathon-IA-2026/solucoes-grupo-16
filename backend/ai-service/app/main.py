"""FastAPI entry point. The artifact registry is loaded once at process startup."""
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.climate_file import ClimateFileError, ClimateFileService
from app.historical import HistoricalDataUnavailable, HistoricalScenarioService
from app.open_meteo_client import OpenMeteoError, fetch_forecast
from app.predictor import Predictor
from app.schemas import (
    ClimateRecord,
    EstimationRequest,
    EstimationResponse,
    HistoricalAvailabilityResponse,
    HistoricalReplayRequest,
    HistoricalReplayResponse,
    Previsao15DiasRequest,
    Previsao15DiasResponse,
)


class ClimateCsvRequest(BaseModel):
    csv_text: str = Field(min_length=1, max_length=5 * 1024 * 1024)


class ClimateEstimateRequest(ClimateCsvRequest):
    timestamp_utc: str


class ClimateEra5EstimateRequest(BaseModel):
    timestamp_utc: str
    availability: float = Field(ge=0, le=1)


def create_app(artifact_dir: Path | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        application.state.predictor = Predictor.from_artifacts(artifact_dir)
        application.state.historical = HistoricalScenarioService.from_environment(application.state.predictor)
        application.state.climate_file = ClimateFileService(application.state.historical)
        yield

    application = FastAPI(title="ClimaGrid AI Service", version="1.0.0", lifespan=lifespan)

    @application.get("/health")
    def health(request: Request) -> dict:
        return request.app.state.predictor.health()

    @application.post("/estimar-geracao", response_model=EstimationResponse)
    def estimate(payload: EstimationRequest, request: Request) -> EstimationResponse:
        return request.app.state.predictor.estimate(payload)

    @application.get("/capabilities")
    def capabilities(request: Request) -> dict:
        return request.app.state.historical.capabilities()

    @application.get("/historico/disponibilidade", response_model=HistoricalAvailabilityResponse)
    def historical_availability(request: Request) -> HistoricalAvailabilityResponse:
        return request.app.state.historical.availability()

    @application.post("/replay-historico", response_model=HistoricalReplayResponse)
    def replay_historical(payload: HistoricalReplayRequest, request: Request) -> HistoricalReplayResponse | JSONResponse:
        try:
            result = request.app.state.historical.request_replay(payload)
            if isinstance(result, dict):
                return JSONResponse(status_code=202, content=result)
            return result
        except HistoricalDataUnavailable as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @application.post("/cenario-climatico/inspecionar")
    def inspect_climate_file(payload: ClimateCsvRequest, request: Request) -> dict:
        try:
            return request.app.state.climate_file.inspect(payload.csv_text)
        except ClimateFileError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @application.post("/cenario-climatico/estimar")
    def estimate_climate_file(payload: ClimateEstimateRequest, request: Request) -> dict:
        try:
            return request.app.state.climate_file.estimate(payload.csv_text, payload.timestamp_utc)
        except ClimateFileError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @application.post("/cenario-climatico/era5/estimar")
    def estimate_era5_climate(
        payload: ClimateEra5EstimateRequest, request: Request
    ) -> dict:
        try:
            result = request.app.state.climate_file.estimate_from_era5(
                payload.timestamp_utc, payload.availability
            )
            if result.get("status") == "preparing":
                return JSONResponse(status_code=202, content=result)
            return result
        except (ClimateFileError, HistoricalDataUnavailable) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @application.post("/previsao-15-dias", response_model=Previsao15DiasResponse)
    def previsao_15_dias(payload: Previsao15DiasRequest, request: Request) -> Previsao15DiasResponse:
        """Previsão de geração eólica para os próximos 15 dias via Open-Meteo/GFS.

        Busca dados meteorológicos previstos, converte para o formato do pipeline
        ERA5, e reutiliza o Predictor existente para estimar a geração em MW.
        """
        # 1. Buscar dados do Open-Meteo (inclui past_days=1 para contexto temporal).
        try:
            meteo_df = fetch_forecast(payload.latitude, payload.longitude)
        except OpenMeteoError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        # 2. Converter DataFrame → lista de ClimateRecord para validação Pydantic.
        now_utc = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        climate_records: list[ClimateRecord] = []
        forecast_warnings: list[str] = []

        for _, row in meteo_df.iterrows():
            try:
                record = ClimateRecord(
                    timestamp_utc=row["timestamp_utc"],
                    u100=float(row["u100"]),
                    v100=float(row["v100"]),
                    temperature_2m=float(row["temperature_2m"]),
                    surface_pressure=float(row["surface_pressure"]),
                )
                climate_records.append(record)
            except Exception:
                # Pular registros que não passam na validação Pydantic
                # (vento > 50 m/s, pressão fora do range, etc.)
                continue

        if not climate_records:
            raise HTTPException(
                status_code=502,
                detail="Nenhum registro do Open-Meteo passou na validação de domínio.",
            )

        # Garantir ordem temporal crescente e unicidade.
        climate_records.sort(key=lambda r: r.timestamp_utc)
        seen_timestamps: set[datetime] = set()
        unique_records: list[ClimateRecord] = []
        for record in climate_records:
            if record.timestamp_utc not in seen_timestamps:
                seen_timestamps.add(record.timestamp_utc)
                unique_records.append(record)
        climate_records = unique_records

        if len(climate_records) < 7:
            raise HTTPException(
                status_code=502,
                detail=f"Dados insuficientes do Open-Meteo: apenas {len(climate_records)} "
                       f"registros válidos (mínimo 7 para janela de contexto).",
            )

        # 3. Construir EstimationRequest com TODOS os registros (passado + futuro)
        #    para que o Predictor calcule features temporais corretamente.
        estimation_request = EstimationRequest(
            usina_id=payload.usina_id,
            capacidade_instalada_mw=payload.capacidade_instalada_mw,
            disponibilidade=payload.disponibilidade,
            registros=climate_records,
        )

        # 4. Delegar ao Predictor existente.
        estimation_response = request.app.state.predictor.estimate(estimation_request)

        # 5. Filtrar: retornar somente as horas futuras (>= agora).
        future_predictions = [
            p for p in estimation_response.predicoes
            if p.timestamp_utc >= now_utc
        ]

        if not future_predictions:
            forecast_warnings.append("nenhuma_hora_futura_disponivel")

        # 6. Propagar warnings relevantes.
        forecast_warnings.append("dados_meteorologicos_previstos_gfs: incerteza_maior_que_reanálise_era5")

        if estimation_response.model_scope == "physical_fallback":
            forecast_warnings.append(
                "usina_fora_do_dominio_de_treino: previsao_usa_curva_fisica_generica"
            )
        elif estimation_response.model_scope == "mixed":
            forecast_warnings.append(
                "previsao_parcial_com_modelo_ml: registros_sem_contexto_temporal_usam_curva_fisica"
            )

        return Previsao15DiasResponse(
            usina_id=payload.usina_id,
            model_version=estimation_response.model_version,
            model_scope=estimation_response.model_scope,
            data_source="open-meteo-gfs",
            horizon_hours=len(future_predictions),
            predicoes=future_predictions,
            warnings=forecast_warnings,
        )

    return application


app = create_app()

