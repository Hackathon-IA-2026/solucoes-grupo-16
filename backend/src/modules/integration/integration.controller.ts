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
  timestamp?: string;
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
          historicalReplay: capabilities.features.historical_replay,
          historicalEstimates: false,
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
          historicalFirstTimestamp:
            capabilities.data.historical_first_timestamp,
          historicalLastTimestamp:
            capabilities.data.historical_last_timestamp,
          historicalLatestTimestamp:
            capabilities.data.historical_latest_timestamp,
          historicalInstantCount:
            capabilities.data.historical_instant_count,
        },
      };
    } catch {
      return {
        backend: { available: true },
        pwf: { upload: true, generationTargets: true, export: true },
        aiService: { available: false },
        climate: {
          historicalReplay: false,
          historicalEstimates: false,
          fileUpload: false,
        },
        model: null,
        data: null,
      };
    }
  }

  @Post('climate-scenarios/historical')
  @ApiOperation({ summary: 'Reproduzir a geração observada em uma hora ONS + ERA5' })
  async historical(@Body() body: HistoricalScenarioBody) {
    const timestamp = parseTimestamp(body.timestamp, 'timestamp');
    if (body.subsystem !== 'NE') {
      throw new BadRequestException('O MVP aceita somente o subsistema NE.');
    }
    if (body.resolutionMinutes !== 60) {
      throw new BadRequestException(
        'A integração atual aceita somente a resolução nativa de 60 minutos.',
      );
    }

    const result = await this.ai.replayHistorical({
      subsystem: 'NE',
      timestamp: timestamp.toISOString(),
      resolution_minutes: 60,
    });

    return {
      scenario: {
        id: result.scenario_id,
        source: 'historical',
        mode: 'replay',
        subsystem: result.subsystem,
        timestamp: result.timestamp,
        resolutionMinutes: result.resolution_minutes,
        snapshotDate: result.snapshot_date,
        dataVersion: result.data_version,
        generationSource: result.generation_source,
        weatherSource: result.weather_source,
        warnings: result.warnings,
        createdAt: new Date().toISOString(),
      },
      observations: result.observations.map((observation) => ({
        id: observation.usina_id,
        onsId: observation.ons_id,
        name: observation.name,
        state: observation.state,
        latitude: observation.latitude,
        longitude: observation.longitude,
        installedCapacityMw: observation.installed_capacity_mw,
        observedGenerationMw: observation.observed_generation_mw,
        estimatedGenerationMw: null,
        capacityFactorPercent: observation.capacity_factor_percent,
        u100: observation.u100,
        v100: observation.v100,
        windSpeedMps: observation.wind_speed_mps,
        windDirectionDegrees: observation.wind_direction_degrees,
        generationSource: observation.generation_source,
        weatherSource: observation.weather_source,
        suggestedBusAllocations: observation.suggested_bus_allocations.map(
          (allocation) => ({
            busNumber: String(allocation.bus_number),
            busName: allocation.bus_name,
            allocationFactor: allocation.allocation_factor,
            allocatedGenerationMw: allocation.allocated_generation_mw,
          }),
        ),
        mappingCoveragePercent: observation.mapping_coverage_percent,
        warnings: observation.warnings,
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
