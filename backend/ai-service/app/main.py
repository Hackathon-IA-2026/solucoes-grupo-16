"""FastAPI entry point. The artifact registry is loaded once at process startup."""
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException

from app.historical import HistoricalDataUnavailable, HistoricalScenarioService
from app.predictor import Predictor
from app.schemas import (
    EstimationRequest,
    EstimationResponse,
    HistoricalEstimationResponse,
    HistoricalScenarioRequest,
)

def create_app(artifact_dir: Path | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        application.state.predictor = Predictor.from_artifacts(artifact_dir)
        yield

    application = FastAPI(title="ClimaGrid AI Service", version="1.0.0", lifespan=lifespan)

    @application.get("/health")
    def health(request: Request) -> dict:
        return request.app.state.predictor.health()

    @application.post("/estimar-geracao", response_model=EstimationResponse)
    def estimate(payload: EstimationRequest, request: Request) -> EstimationResponse:
        return request.app.state.predictor.estimate(payload)

    return application


app = create_app()
