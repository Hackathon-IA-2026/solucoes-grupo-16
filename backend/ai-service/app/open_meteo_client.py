"""Cliente HTTP para Open-Meteo (modelo GFS) — previsão até 16 dias.

Converte a resposta da API para o formato interno do pipeline ClimaGrid,
mantendo compatibilidade total com as variáveis do ERA5 que o modelo espera:
u100, v100 (m/s), temperature_2m (Kelvin) e surface_pressure (Pascal).
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone

import httpx
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Timeout generoso para conexões instáveis durante demonstrações ao vivo.
_CONNECT_TIMEOUT = 10.0
_READ_TIMEOUT = 30.0


class OpenMeteoError(Exception):
    """Raised when the Open-Meteo API returns an error or is unreachable."""


def fetch_forecast(
    latitude: float,
    longitude: float,
    *,
    past_days: int = 1,
    forecast_days: int = 16,
) -> pd.DataFrame:
    """Busca previsão do Open-Meteo e retorna DataFrame compatível com o pipeline.

    Parameters
    ----------
    latitude, longitude : float
        Coordenadas do parque eólico.
    past_days : int
        Dias de passado recente incluídos para preencher a janela de contexto
        temporal das features (lags de 3h e 6h). O padrão de 1 dia (24h) é
        suficiente para o ``required_history_hours=6`` do modelo.
    forecast_days : int
        Dias de previsão futura. O Open-Meteo/GFS suporta até 16 dias.

    Returns
    -------
    pd.DataFrame
        Colunas: ``timestamp_utc``, ``u100``, ``v100``, ``temperature_2m``,
        ``surface_pressure`` — todas nas unidades esperadas pelo pipeline.

    Raises
    ------
    OpenMeteoError
        Se a API retornar erro, estiver indisponível ou a resposta for inválida.
    """
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": "temperature_2m,surface_pressure,wind_speed_100m,wind_direction_100m",
        "past_days": past_days,
        "forecast_days": forecast_days,
        "timezone": "UTC",
        "wind_speed_unit": "ms",
    }

    try:
        with httpx.Client(timeout=httpx.Timeout(_READ_TIMEOUT, connect=_CONNECT_TIMEOUT)) as client:
            response = client.get(OPEN_METEO_URL, params=params)
    except httpx.HTTPError as exc:
        raise OpenMeteoError(f"Falha de rede ao consultar Open-Meteo: {exc}") from exc

    if response.status_code != 200:
        raise OpenMeteoError(
            f"Open-Meteo retornou status {response.status_code}: {response.text[:500]}"
        )

    try:
        data = response.json()
    except Exception as exc:
        raise OpenMeteoError(f"Resposta do Open-Meteo não é JSON válido: {exc}") from exc

    hourly = data.get("hourly")
    if not hourly or "time" not in hourly:
        raise OpenMeteoError("Resposta do Open-Meteo sem dados horários.")

    return _convert_to_pipeline_format(hourly)


def _convert_to_pipeline_format(hourly: dict) -> pd.DataFrame:
    """Converte a resposta horária do Open-Meteo para o formato do pipeline ERA5.

    Conversões aplicadas:
    1. Velocidade (m/s) + Direção (°) → componentes vetoriais u100, v100
       usando a convenção meteorológica (direção = de onde o vento vem).
    2. Temperatura de °C → Kelvin (+ 273.15).
    3. Pressão de hPa → Pascal (× 100).
    """
    timestamps = pd.to_datetime(hourly["time"], utc=True)

    wind_speed = pd.to_numeric(pd.Series(hourly["wind_speed_100m"]), errors="coerce")
    wind_dir_deg = pd.to_numeric(pd.Series(hourly["wind_direction_100m"]), errors="coerce")
    wind_dir_rad = np.deg2rad(wind_dir_deg)

    # Convenção meteorológica: direção indica DE ONDE o vento vem.
    # u = componente zonal (positivo = de oeste para leste)
    # v = componente meridional (positivo = de sul para norte)
    u100 = -wind_speed * np.sin(wind_dir_rad)
    v100 = -wind_speed * np.cos(wind_dir_rad)

    # Open-Meteo retorna °C; ClimateRecord valida ge=150 le=350 (Kelvin).
    temperature_k = pd.to_numeric(
        pd.Series(hourly["temperature_2m"]), errors="coerce"
    ) + 273.15

    # Open-Meteo retorna hPa; ClimateRecord valida ge=50_000 (Pascal).
    surface_pressure_pa = pd.to_numeric(
        pd.Series(hourly["surface_pressure"]), errors="coerce"
    ) * 100.0

    df = pd.DataFrame({
        "timestamp_utc": timestamps,
        "u100": u100,
        "v100": v100,
        "temperature_2m": temperature_k,
        "surface_pressure": surface_pressure_pa,
    })

    # Remover linhas com NaN nas variáveis meteorológicas essenciais.
    essential = ["u100", "v100", "temperature_2m", "surface_pressure"]
    before = len(df)
    df = df.dropna(subset=essential).reset_index(drop=True)
    dropped = before - len(df)
    if dropped:
        logger.warning("Open-Meteo: %d linhas descartadas por NaN em variáveis essenciais.", dropped)

    if df.empty:
        raise OpenMeteoError("Todos os dados do Open-Meteo continham NaN após conversão.")

    return df
