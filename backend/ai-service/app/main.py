"""FastAPI entry point. The artifact registry is loaded once at process startup."""
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException

from app.historical import HistoricalDataUnavailable, HistoricalScenarioService
from app.predictor import Predictor
from app.schemas import (
    EstimationRequest,
    EstimationResponse,
    HistoricalAvailabilityResponse,
    HistoricalReplayRequest,
    HistoricalReplayResponse,
)

def create_app(artifact_dir: Path | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        application.state.predictor = Predictor.from_artifacts(artifact_dir)
        application.state.historical = HistoricalScenarioService.from_environment(application.state.predictor)
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
    def replay_historical(payload: HistoricalReplayRequest, request: Request) -> HistoricalReplayResponse:
        try:
            return request.app.state.historical.replay(payload)
        except HistoricalDataUnavailable as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    return application


app = create_app()
