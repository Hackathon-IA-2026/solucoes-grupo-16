"""FastAPI entry point. The artifact registry is loaded once at process startup."""
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.climate_file import ClimateFileError, ClimateFileService
from app.experimental_insights import ExperimentalInsightsService
from app.historical import HistoricalDataUnavailable, HistoricalScenarioService
from app.predictor import Predictor
from app.schemas import (
    EstimationRequest,
    EstimationResponse,
    HistoricalAvailabilityResponse,
    HistoricalReplayRequest,
    HistoricalReplayResponse,
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
        application.state.experimental_insights = ExperimentalInsightsService()
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
        result = request.app.state.historical.capabilities()
        result["features"]["experimental_insights"] = (
            request.app.state.experimental_insights.available()
        )
        return result

    @application.get("/insights-experimentais")
    def experimental_insights(request: Request) -> dict:
        try:
            return request.app.state.experimental_insights.read()
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

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

    return application


app = create_app()
