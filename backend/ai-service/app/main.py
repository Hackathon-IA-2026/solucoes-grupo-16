"""FastAPI entry point. The artifact registry is loaded once at process startup."""
from fastapi import FastAPI, HTTPException

from app.historical import HistoricalDataUnavailable, HistoricalScenarioService
from app.predictor import Predictor
from app.schemas import (
    EstimationRequest,
    EstimationResponse,
    HistoricalEstimationResponse,
    HistoricalScenarioRequest,
)

app = FastAPI(title="ClimaGrid AI Service", version="1.0.0")
predictor = Predictor.from_artifacts()
historical_scenarios = HistoricalScenarioService.from_environment(predictor)


@app.get("/health")
def health() -> dict:
    return predictor.health()


@app.get("/capabilities")
def capabilities() -> dict:
    return historical_scenarios.capabilities()


@app.post("/estimar-geracao", response_model=EstimationResponse)
def estimate(payload: EstimationRequest) -> EstimationResponse:
    return predictor.estimate(payload)


@app.post("/estimar-historico", response_model=HistoricalEstimationResponse)
def estimate_historical(
    payload: HistoricalScenarioRequest,
) -> HistoricalEstimationResponse:
    try:
        return historical_scenarios.estimate(payload)
    except HistoricalDataUnavailable as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
