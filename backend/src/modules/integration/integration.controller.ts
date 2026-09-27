import {
  BadGatewayException,
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
import { createHash, randomUUID } from 'node:crypto';
import {
  AiServiceClient,
  type AiClimateFileEstimate,
} from './ai-service.client.js';
import { ClimateScenarioStorageService } from '../climate-scenario/climate-scenario-storage.service.js';
import type { ClimateScenarioManifest } from '../climate-scenario/climate-scenario.types.js';

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

interface Era5ScenarioBody {
  timestamp?: string;
  availability?: number;
}

@ApiTags('Integration')
@Controller()
export class IntegrationController {
  constructor(
    private readonly ai: AiServiceClient,
    private readonly scenarios: ClimateScenarioStorageService,
  ) {}

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
          historicalOnDemand: capabilities.features.historical_on_demand ?? false,
          historicalEstimates: false,
          fileUpload: capabilities.features.climate_file_upload,
          era5Scenario:
            capabilities.features.climate_era5_scenario ?? false,
          experimentalInsights:
            capabilities.features.experimental_insights ?? false,
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
          historicalOnDemand: false,
          historicalEstimates: false,
          fileUpload: false,
          era5Scenario: false,
          experimentalInsights: false,
        },
        model: null,
        data: null,
      };
    }
  }

  @Get('experimental-insights')
  @ApiOperation({
    summary: 'Consultar evidências exploratórias do challenger DML para o pitch',
  })
  async experimentalInsights() {
    return this.ai.experimentalInsights();
  }

  @Post('climate-scenarios/era5/estimate')
  @ApiOperation({
    summary:
      'Estimar potencial físico usando vento ERA5 histórico e disponibilidade informada',
  })
  async estimateEra5Scenario(@Body() body: Era5ScenarioBody) {
    const timestamp = parseTimestamp(body.timestamp, 'timestamp');
    if (
      typeof body.availability !== 'number' ||
      !Number.isFinite(body.availability) ||
      body.availability < 0 ||
      body.availability > 1
    ) {
      throw new BadRequestException(
        'A disponibilidade deve ser um número entre 0 e 1.',
      );
    }
    const result = await this.ai.estimateClimateEra5(
      timestamp.toISOString(),
      body.availability,
    );
    if ('status' in result) return result;
    if (!result.normalized_csv) {
      throw new BadGatewayException(
        'O serviço de estimativa não devolveu o CSV normalizado do cenário ERA5.',
      );
    }
    const input = Buffer.from(result.normalized_csv, 'utf8');
    const inputSha256 = createHash('sha256').update(input).digest('hex');
    if (inputSha256 !== result.provenance.input_sha256) {
      throw new BadGatewayException(
        'O CSV normalizado devolvido pelo serviço não corresponde à proveniência.',
      );
    }
    const filename = `era5_${timestamp.toISOString().replace(/[:.]/g, '-')}.csv`;
    return this.persistClimateEstimate(result, input, filename, 'era5');
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

    if ('status' in result) {
      return result;
    }

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
    const inputSha256 = createHash('sha256').update(file!.buffer).digest('hex');
    if (
      inputSha256 !== result.provenance.input_sha256 ||
      result.data_version !== `user-csv-sha256-${inputSha256}`
    ) {
      throw new BadGatewayException(
        'O serviço de estimativa devolveu uma proveniência incompatível com o CSV recebido.',
      );
    }
    return this.persistClimateEstimate(
      result,
      file!.buffer,
      file!.originalname,
      'upload',
    );
  }

  private async persistClimateEstimate(
    result: AiClimateFileEstimate,
    input: Buffer,
    filename: string,
    source: 'upload' | 'era5',
  ) {
    const inputSha256 = createHash('sha256').update(input).digest('hex');
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const observations = result.observations.map((observation) => ({
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
    }));
    const scenario = {
      id,
      source,
      mode: 'scenario' as const,
      subsystem: result.subsystem,
      timestamp: result.timestamp,
      resolutionMinutes: result.resolution_minutes,
      fileName: filename,
      fileSizeBytes: input.length,
      rowCount: result.row_count,
      dataVersion: result.data_version,
      generationSource: result.generation_source,
      weatherSource: result.weather_source,
      warnings: result.warnings,
      createdAt,
      traceability: {
        schemaVersion: result.provenance.input_schema_version,
        inputSha256,
        catalogSha256: result.provenance.catalog_sha256,
        mappingSha256: result.provenance.mapping_sha256,
        estimatorVersion: result.provenance.estimator_version,
        weatherDataVersion: result.provenance.weather_data_version,
        era5Sha256: result.provenance.era5_sha256,
        availabilitySource: result.provenance.availability_source,
        availabilityValue: result.provenance.availability_value,
        excludedPlantIds: result.provenance.excluded_usina_ids,
        catalogCoveragePercent: result.provenance.catalog_coverage_percent,
      },
    };
    const manifest: ClimateScenarioManifest = {
      schemaVersion: 'climagrid-climate-scenario-v1',
      id,
      createdAt,
      subsystem: result.subsystem,
      timestamp: result.timestamp,
      resolutionMinutes: result.resolution_minutes,
      generationSource: result.generation_source,
      weatherSource: result.weather_source,
      dataVersion: result.data_version,
      input: {
        schemaVersion: result.provenance.input_schema_version,
        name: filename,
        sizeBytes: input.length,
        sha256: inputSha256,
        mediaType: 'text/csv',
        rowCount: result.row_count,
        source:
          source === 'era5' ? 'era5_cds_generated' : 'user_upload',
      },
      provenance: {
        catalogSha256: result.provenance.catalog_sha256,
        mappingSha256: result.provenance.mapping_sha256,
        estimatorVersion: result.provenance.estimator_version,
        weatherDataVersion: result.provenance.weather_data_version,
        era5Sha256: result.provenance.era5_sha256,
        availabilitySource: result.provenance.availability_source,
        availabilityValue: result.provenance.availability_value,
        excludedPlantIds: result.provenance.excluded_usina_ids,
        catalogCoveragePercent: result.provenance.catalog_coverage_percent,
        physicalCurve: {
          cutInMs: result.provenance.physical_curve.cut_in_ms,
          ratedMs: result.provenance.physical_curve.rated_ms,
          cutOutMs: result.provenance.physical_curve.cut_out_ms,
        },
      },
      observations,
      warnings: result.warnings,
    };
    await this.scenarios.saveScenario(manifest, input);
    return { scenario, observations };
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
