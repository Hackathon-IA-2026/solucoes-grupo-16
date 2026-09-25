import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiServiceClient } from './ai-service.client.js';

interface UploadedClimateFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

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

  @Post('climate-scenarios/file/inspect')
  @ApiOperation({ summary: 'Validar CSV climático e listar as horas disponíveis' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: {
    file: { type: 'string', format: 'binary' },
  } } })
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 5 * 1024 * 1024 } }))
  async inspectClimateFile(@UploadedFile() file?: UploadedClimateFile) {
    const csvText = validatedCsv(file);
    const result = await this.ai.inspectClimateFile(csvText);
    return {
      rowCount: result.row_count,
      plantCount: result.plant_count,
      timestamps: result.timestamps,
      sha256: result.sha256,
    };
  }

  @Post('climate-scenarios/file/estimate')
  @ApiOperation({ summary: 'Estimar potencial eólico para uma hora do CSV do usuário' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file', 'timestamp'], properties: {
    file: { type: 'string', format: 'binary' }, timestamp: { type: 'string' },
  } } })
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 5 * 1024 * 1024 } }))
  async estimateClimateFile(@UploadedFile() file?: UploadedClimateFile,
                            @Body('timestamp') timestamp?: string) {
    const csvText = validatedCsv(file);
    const selected = parseTimestamp(timestamp, 'timestamp');
    const result = await this.ai.estimateClimateFile(csvText, selected.toISOString());
    return {
      scenario: {
        id: result.scenario_id,
        source: 'upload', mode: 'scenario', subsystem: result.subsystem,
        timestamp: result.timestamp, resolutionMinutes: result.resolution_minutes,
        fileName: file!.originalname, fileSizeBytes: file!.size,
        rowCount: result.row_count, dataVersion: result.data_version,
        generationSource: result.generation_source, weatherSource: result.weather_source,
        warnings: result.warnings, createdAt: new Date().toISOString(),
      },
      observations: result.observations.map((observation) => ({
        id: observation.usina_id, onsId: observation.ons_id,
        name: observation.name, state: observation.state,
        latitude: observation.latitude, longitude: observation.longitude,
        installedCapacityMw: observation.installed_capacity_mw,
        observedGenerationMw: null,
        estimatedGenerationMw: observation.estimated_generation_mw,
        capacityFactorPercent: observation.capacity_factor_percent,
        u100: observation.u100, v100: observation.v100,
        windSpeedMps: observation.wind_speed_mps,
        windDirectionDegrees: observation.wind_direction_degrees,
        availability: observation.availability,
        generationSource: observation.generation_source,
        weatherSource: observation.weather_source,
        suggestedBusAllocations: observation.suggested_bus_allocations.map((allocation) => ({
          busNumber: String(allocation.bus_number), busName: allocation.bus_name,
          allocationFactor: allocation.allocation_factor,
          allocatedGenerationMw: allocation.allocated_generation_mw,
        })),
        mappingCoveragePercent: observation.mapping_coverage_percent,
        warnings: observation.warnings,
      })),
    };
  }
}

function validatedCsv(file?: UploadedClimateFile): string {
  if (!file || !file.originalname.toLowerCase().endsWith('.csv') || !file.buffer?.length) {
    throw new BadRequestException('Envie um arquivo CSV não vazio.');
  }
  const text = file.buffer.toString('utf8');
  if (text.includes('\uFFFD')) {
    throw new BadRequestException('O CSV deve estar codificado em UTF-8.');
  }
  return text;
}

function parseTimestamp(value: string | undefined, field: string): Date {
  if (!value) throw new BadRequestException(`O campo ${field} é obrigatório.`);
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new BadRequestException(`O campo ${field} deve ser uma data ISO válida.`);
  }
  return timestamp;
}
