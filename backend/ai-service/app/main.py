"""FastAPI entry point. The artifact registry is loaded once at process startup."""
from fastapi import FastAPI

from app.predictor import Predictor
from app.schemas import EstimationRequest, EstimationResponse

app = FastAPI(title="ClimaGrid AI Service", version="1.0.0")
predictor = Predictor.from_artifacts()


@app.get("/health")
def health() -> dict:
    return predictor.health()


@app.post("/estimar-geracao", response_model=EstimationResponse)
def estimate(payload: EstimationRequest) -> EstimationResponse:
    return predictor.estimate(payload)
