import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

export interface AiCapabilities {
  status: string;
  model: {
    status: string;
    model_version: string;
    model_scope: string;
    model_approved: boolean;
  };
  data: {
    plant_catalog_available: boolean;
    ons_raw_available: boolean;
    era5_processed_available: boolean;
    era5_partition_count: number;
    joined_snapshot_available: boolean;
    joined_snapshot_date: string | null;
    historical_first_timestamp: string | null;
    historical_last_timestamp: string | null;
    historical_latest_timestamp: string | null;
    historical_instant_count: number;
  };
  features: {
    historical_replay: boolean;
    historical_estimates: boolean;
    climate_file_upload: boolean;
    physical_fallback: boolean;
  };
}

export interface AiHistoricalReplayResponse {
  scenario_id: string;
  subsystem: 'NE';
  timestamp: string;
  resolution_minutes: 60;
  snapshot_date: string;
  data_version: string;
  generation_source: 'ONS_GERACAO_USINA_2_HO';
  weather_source: 'ERA5';
  observations: Array<{
    usina_id: string;
    ons_id: string;
    name: string;
    state: string;
    latitude: number | null;
    longitude: number | null;
    installed_capacity_mw: number;
    observed_generation_mw: number;
    capacity_factor_percent: number | null;
    u100: number;
    v100: number;
    wind_speed_mps: number;
    wind_direction_degrees: number;
    generation_source: 'ONS_GERACAO_USINA_2_HO';
    weather_source: 'ERA5';
    suggested_bus_allocations: Array<{
      bus_number: number;
      bus_name: string;
      allocation_factor: number;
      allocated_generation_mw: number;
    }>;
    mapping_coverage_percent: number;
    warnings: string[];
  }>;
  warnings: string[];
}

export interface AiClimateFileInspection {
  row_count: number;
  plant_count: number;
  timestamps: string[];
  sha256: string;
}

export interface AiClimateFileEstimate {
  scenario_id: string;
  subsystem: 'NE';
  timestamp: string;
  resolution_minutes: 60;
  data_version: string;
  generation_source: 'PHYSICAL_CURVE';
  weather_source: 'USER';
  row_count: number;
  warnings: string[];
  observations: Array<{
    usina_id: string;
    ons_id: string;
    name: string;
    state: string;
    latitude: number | null;
    longitude: number | null;
    installed_capacity_mw: number;
    observed_generation_mw: null;
    estimated_generation_mw: number;
    capacity_factor_percent: number;
    u100: number;
    v100: number;
    wind_speed_mps: number;
    wind_direction_degrees: number;
    availability: number;
    generation_source: 'PHYSICAL_CURVE';
    weather_source: 'USER';
    suggested_bus_allocations: AiHistoricalReplayResponse['observations'][number]['suggested_bus_allocations'];
    mapping_coverage_percent: number;
    warnings: string[];
  }>;
}

@Injectable()
export class AiServiceClient {
  private readonly baseUrl = (
    process.env.AI_SERVICE_URL ?? 'http://127.0.0.1:8000'
  ).replace(/\/$/, '');

  async capabilities(): Promise<AiCapabilities> {
    return this.request<AiCapabilities>('/capabilities');
  }

  async replayHistorical(payload: {
    subsystem: 'NE';
    timestamp: string;
    resolution_minutes: 60;
  }): Promise<AiHistoricalReplayResponse> {
    return this.request<AiHistoricalReplayResponse>(
      '/replay-historico',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      120_000,
    );
  }

  async inspectClimateFile(csvText: string): Promise<AiClimateFileInspection> {
    return this.request<AiClimateFileInspection>('/cenario-climatico/inspecionar', {
      method: 'POST', body: JSON.stringify({ csv_text: csvText }),
    }, 120_000);
  }

  async estimateClimateFile(csvText: string, timestampUtc: string): Promise<AiClimateFileEstimate> {
    return this.request<AiClimateFileEstimate>('/cenario-climatico/estimar', {
      method: 'POST', body: JSON.stringify({ csv_text: csvText, timestamp_utc: timestampUtc }),
    }, 120_000);
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
    timeoutMs = 15_000,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        `O serviço de IA não respondeu em ${this.baseUrl}.`,
        { cause: error },
      );
    }

    const text = await response.text();
    if (!response.ok) {
      let message = text;
      try {
        const parsed = JSON.parse(text) as { detail?: string; message?: string };
        message = parsed.detail ?? parsed.message ?? text;
      } catch {
        // Mantém a resposta textual do serviço de IA.
      }
      throw new HttpException(
        message || 'Falha ao consultar o serviço de IA.',
        response.status,
      );
    }
    return JSON.parse(text) as T;
  }
}
