import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiServiceClient } from './ai-service.client.js';

interface HistoricalScenarioBody {
  subsystem?: string;
  startAt?: string;
  endAt?: string;
  resolutionMinutes?: number;
}

@ApiTags('Integration')
@Controller()
export class IntegrationController {
  constructor(private readonly ai: AiServiceClient) {}

  @Get('system/capabilities')
  @ApiOperation({ summary: 'Estado das integrações e insumos do ClimaGrid' })
  async capabilities() {
    try {
      const capabilities = await this.ai.capabilities();
      return {
        backend: { available: true },
        pwf: { upload: true, generationTargets: true, export: true },
        aiService: { available: true },
        climate: {
          historicalEstimates: capabilities.features.historical_estimates,
          fileUpload: capabilities.features.climate_file_upload,
        },
        model: {
          version: capabilities.model.model_version,
          scope: capabilities.model.model_scope,
          approved: capabilities.model.model_approved,
          physicalFallback: capabilities.features.physical_fallback,
        },
        data: {
          plantCatalog: capabilities.data.plant_catalog_available,
          onsRaw: capabilities.data.ons_raw_available,
          era5Processed: capabilities.data.era5_processed_available,
          era5PartitionCount: capabilities.data.era5_partition_count,
          joinedSnapshot: capabilities.data.joined_snapshot_available,
          snapshotDate: capabilities.data.joined_snapshot_date,
        },
      };
    } catch {
      return {
        backend: { available: true },
        pwf: { upload: true, generationTargets: true, export: true },
        aiService: { available: false },
        climate: { historicalEstimates: false, fileUpload: false },
        model: null,
        data: null,
      };
    }
  }

  @Post('climate-scenarios/historical')
  @ApiOperation({ summary: 'Estimar geração para um período ONS + ERA5' })
  async historical(@Body() body: HistoricalScenarioBody) {
    const startAt = parseTimestamp(body.startAt, 'startAt');
    const endAt = parseTimestamp(body.endAt, 'endAt');
    if (endAt <= startAt) {
      throw new BadRequestException('endAt deve ser posterior a startAt.');
    }
    if (body.subsystem !== 'NE') {
      throw new BadRequestException('O MVP aceita somente o subsistema NE.');
    }
    if (body.resolutionMinutes !== 60) {
      throw new BadRequestException(
        'A integração atual aceita somente a resolução nativa de 60 minutos.',
      );
    }

    const result = await this.ai.estimateHistorical({
      subsystem: 'NE',
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      resolution_minutes: 60,
    });

    return {
      scenario: {
        id: result.scenario_id,
        source: 'historical',
        subsystem: result.subsystem,
        startAt: result.start_at,
        endAt: result.end_at,
        resolutionMinutes: result.resolution_minutes,
        snapshotDate: result.snapshot_date,
        dataVersion: result.data_version,
        modelVersion: result.model_version,
        modelScope: result.model_scope,
        modelApproved: result.model_approved,
        warnings: result.warnings,
        createdAt: new Date().toISOString(),
      },
      estimates: result.estimates.map((estimate) => ({
        id: estimate.usina_id,
        onsId: estimate.ons_id,
        name: estimate.name,
        state: estimate.state,
        latitude: estimate.latitude,
        longitude: estimate.longitude,
        installedCapacityMw: estimate.installed_capacity_mw,
        estimatedGenerationMw: estimate.estimated_generation_mw,
        confidenceLowMw: estimate.confidence_low_mw,
        confidenceHighMw: estimate.confidence_high_mw,
        confidenceLevel: estimate.confidence,
        historicalAvailabilityPercent:
          estimate.historical_availability_percent,
        historicalCurtailmentPercent:
          estimate.historical_curtailment_percent,
        sampleCount: estimate.sample_count,
        probableReason: null,
        riskLevel: 'unavailable',
        warnings: estimate.warnings,
      })),
    };
  }
}

function parseTimestamp(value: string | undefined, field: string): Date {
  if (!value) throw new BadRequestException(`O campo ${field} é obrigatório.`);
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new BadRequestException(`O campo ${field} deve ser uma data ISO válida.`);
  }
  return timestamp;
}
