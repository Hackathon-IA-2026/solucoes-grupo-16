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
  };
  features: {
    historical_estimates: boolean;
    climate_file_upload: boolean;
    physical_fallback: boolean;
  };
}

export interface AiHistoricalResponse {
  scenario_id: string;
  subsystem: 'NE';
  start_at: string;
  end_at: string;
  resolution_minutes: 60;
  snapshot_date: string;
  data_version: string;
  model_version: string;
  model_scope: string;
  model_approved: boolean;
  estimates: Array<{
    usina_id: string;
    ons_id: string;
    name: string;
    state: string;
    latitude: number | null;
    longitude: number | null;
    installed_capacity_mw: number;
    estimated_generation_mw: number;
    confidence_low_mw: number;
    confidence_high_mw: number;
    confidence: 'alta' | 'media' | 'baixa';
    historical_availability_percent: number;
    historical_curtailment_percent: number | null;
    sample_count: number;
    warnings: string[];
  }>;
  warnings: string[];
}

@Injectable()
export class AiServiceClient {
  private readonly baseUrl = (
    process.env.AI_SERVICE_URL ?? 'http://127.0.0.1:8000'
  ).replace(/\/$/, '');

  async capabilities(): Promise<AiCapabilities> {
    return this.request<AiCapabilities>('/capabilities');
  }

  async estimateHistorical(payload: {
    subsystem: 'NE';
    start_at: string;
    end_at: string;
    resolution_minutes: 60;
  }): Promise<AiHistoricalResponse> {
    return this.request<AiHistoricalResponse>(
      '/estimar-historico',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      120_000,
    );
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
