import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import { PwfStorageService } from '../storage/pwf-storage.service.js';
import { ClimateScenarioStorageService } from '../../climate-scenario/climate-scenario-storage.service.js';
import type {
  ClimateScenarioManifest,
  PersistedClimateObservation,
} from '../../climate-scenario/climate-scenario.types.js';

export interface PwfExportPlant {
  plantId: string;
  onsId: string;
  generationMw: number;
  mapping: {
    busNumber: string;
    busName: string;
    nominalVoltageKv: string;
    area: string;
    allocationFactor?: number;
  };
}

export interface PwfExportRequest {
  referencePwfId: string;
  scenarioId: string;
  studyName: string;
  generationSource: 'observed' | 'estimated';
  dataVersion: string;
  selectedPlantIds?: string[];
  plants: PwfExportPlant[];
}

export interface PwfExportResult {
  buffer: Buffer;
  filename: string;
  generatedAt: string;
  generationSource: 'observed' | 'estimated';
  dataVersion: string;
  modifiedBuses: number[];
  exportId?: string;
  outputSha256?: string;
  referenceSha256?: string;
}

@Injectable()
export class PwfExportService {
  constructor(
    private readonly storage: PwfStorageService,
    @Optional()
    private readonly scenarios?: ClimateScenarioStorageService,
  ) {}

  async export(payload: PwfExportRequest): Promise<PwfExportResult> {
    validatePayload(payload);

    let plants = payload.plants;
    let scenario: ClimateScenarioManifest | undefined;
    let selectedPlantIds: string[] = [];
    if (payload.generationSource === 'estimated') {
      if (!this.scenarios) {
        throw new InternalServerErrorException(
          'O armazenamento de cenários climáticos não está disponível.',
        );
      }
      scenario = await this.scenarios.getScenario(payload.scenarioId);
      ({ plants, selectedPlantIds } = authoritativeEstimatedPlants(
        payload,
        scenario,
      ));
    }

    const [metadata, index, original] = await Promise.all([
      this.storage.getMetadata(payload.referencePwfId),
      this.storage.getIndex(payload.referencePwfId),
      this.storage.getOriginalPwf(payload.referencePwfId),
    ]);
    const output = Buffer.from(original);
    const busesByNumber = new Map(index.buses.map((bus) => [bus.number, bus]));
    const modifiedBuses: number[] = [];
    const generationByBus = new Map<
      number,
      { generationMw: number; plantLabels: string[] }
    >();

    for (const plant of plants) {
      const busNumber = Number(plant.mapping.busNumber);
      if (!Number.isSafeInteger(busNumber) || busNumber <= 0) {
        throw new BadRequestException(
          `A barra informada para ${plant.onsId || plant.plantId} é inválida.`,
        );
      }
      const accumulated = generationByBus.get(busNumber) ?? {
        generationMw: 0,
        plantLabels: [],
      };
      accumulated.generationMw += plant.generationMw;
      accumulated.plantLabels.push(plant.onsId || plant.plantId);
      generationByBus.set(busNumber, accumulated);
    }

    for (const [busNumber, allocation] of generationByBus) {
      const bus = busesByNumber.get(busNumber);
      if (!bus) {
        throw new UnprocessableEntityException(
          `A barra ${busNumber} não existe no caso PWF de referência.`,
        );
      }
      if (bus.status === 'D' || bus.type === 2) {
        throw new UnprocessableEntityException(
          `A barra ${busNumber} não é editável (desligada ou barra swing).`,
        );
      }
      if (
        bus.activeGenerationMaximumMw !== undefined &&
        allocation.generationMw > bus.activeGenerationMaximumMw + 1e-6
      ) {
        throw new UnprocessableEntityException(
          `A geração agregada de ${allocation.generationMw} MW excede o limite de ${bus.activeGenerationMaximumMw} MW da barra ${busNumber}.`,
        );
      }

      const field = bus.activeGenerationField;
      const formatted = formatFixedWidthNumber(
        allocation.generationMw,
        field.width,
        field.rawValue,
      );
      const fieldEnd = field.byteOffset + field.width;
      if (field.byteOffset < 0 || fieldEnd > output.length) {
        throw new UnprocessableEntityException(
          `O índice da barra ${busNumber} não corresponde ao arquivo PWF armazenado.`,
        );
      }
      output.write(formatted, field.byteOffset, field.width, 'latin1');
      modifiedBuses.push(busNumber);
    }

    const extension = extname(metadata.name) || '.pwf';
    const stem = basename(metadata.name, extension)
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 120);
    const filename = `${stem || 'cenario'}_climagrid${extension.toLowerCase()}`;
    const generatedAt = new Date().toISOString();
    const outputSha256 = createHash('sha256').update(output).digest('hex');

    let exportId: string | undefined;
    if (scenario && this.scenarios) {
      exportId = randomUUID();
      const selected = new Set(selectedPlantIds);
      await this.scenarios.saveExport({
        schemaVersion: 'climagrid-pwf-export-v1',
        id: exportId,
        scenarioId: scenario.id,
        createdAt: generatedAt,
        studyName: payload.studyName,
        referencePwf: {
          id: metadata.id,
          name: metadata.name,
          sha256: metadata.sha256,
        },
        output: {
          filename,
          sizeBytes: output.length,
          sha256: outputSha256,
          modifiedBuses,
        },
        selection: {
          selectedPlantIds,
          unselectedPlantIds: scenario.observations
            .map((observation) => observation.id)
            .filter((id) => !selected.has(id)),
          unselectedPlantBehavior: 'preserve_reference_pwf_pg',
        },
        allocations: plants.map((plant) => ({
          plantId: plant.plantId,
          onsId: plant.onsId,
          busNumber: Number(plant.mapping.busNumber),
          allocationFactor: plant.mapping.allocationFactor!,
          generationMw: plant.generationMw,
        })),
      }, output);
    }

    return {
      buffer: output,
      filename,
      generatedAt,
      generationSource: payload.generationSource,
      dataVersion: payload.dataVersion,
      modifiedBuses,
      exportId,
      outputSha256,
      referenceSha256: metadata.sha256,
    };
  }
}

function authoritativeEstimatedPlants(
  payload: PwfExportRequest,
  scenario: ClimateScenarioManifest,
): { plants: PwfExportPlant[]; selectedPlantIds: string[] } {
  if (
    payload.dataVersion !== scenario.dataVersion ||
    scenario.generationSource !== 'PHYSICAL_CURVE'
  ) {
    throw new BadRequestException(
      'A proveniência informada não corresponde ao cenário climático persistido.',
    );
  }
  if (!Array.isArray(payload.selectedPlantIds) || payload.selectedPlantIds.length === 0) {
    throw new BadRequestException(
      'A exportação estimada deve informar os conjuntos selecionados.',
    );
  }
  const selectedPlantIds = [...new Set(payload.selectedPlantIds)];
  if (selectedPlantIds.length !== payload.selectedPlantIds.length) {
    throw new BadRequestException('A seleção de conjuntos possui IDs duplicados.');
  }

  const observations = new Map(
    scenario.observations.map((observation) => [observation.id, observation]),
  );
  const factors = new Map<string, number>();
  const plants = payload.plants.map((plant) => {
    const observation = observations.get(plant.plantId);
    if (!observation || observation.onsId !== plant.onsId) {
      throw new BadRequestException(
        `O conjunto ${plant.plantId} não pertence ao cenário climático persistido.`,
      );
    }
    assertSafeMappingCoverage(observation);
    const factor = plant.mapping.allocationFactor;
    if (
      typeof factor !== 'number' ||
      !Number.isFinite(factor) ||
      factor <= 0 ||
      factor > 1
    ) {
      throw new BadRequestException(
        `O fator de alocação de ${plant.onsId} é inválido.`,
      );
    }
    const authoritativeGeneration = roundMw(
      observation.estimatedGenerationMw * factor,
    );
    if (Math.abs(plant.generationMw - authoritativeGeneration) > 1e-5) {
      throw new BadRequestException(
        `A geração enviada para ${plant.onsId} não corresponde à estimativa persistida.`,
      );
    }
    factors.set(plant.plantId, (factors.get(plant.plantId) ?? 0) + factor);
    return {
      ...plant,
      generationMw: authoritativeGeneration,
      mapping: { ...plant.mapping, allocationFactor: factor },
    };
  });

  const allocatedPlantIds = [...factors.keys()].sort();
  const expectedPlantIds = [...selectedPlantIds].sort();
  if (
    allocatedPlantIds.length !== expectedPlantIds.length ||
    allocatedPlantIds.some((id, index) => id !== expectedPlantIds[index])
  ) {
    throw new BadRequestException(
      'Cada conjunto selecionado deve possuir ao menos uma alocação.',
    );
  }
  for (const [plantId, total] of factors) {
    if (Math.abs(total - 1) > 1e-6) {
      throw new BadRequestException(
        `Os fatores de alocação de ${plantId} devem somar 100%.`,
      );
    }
  }
  return { plants, selectedPlantIds };
}

function assertSafeMappingCoverage(observation: PersistedClimateObservation): void {
  if (
    observation.mappingCoveragePercent > 0 &&
    observation.mappingCoveragePercent < 100
  ) {
    throw new UnprocessableEntityException(
      `O conjunto ${observation.onsId} possui mapeamento PWF parcial e não pode ser exportado até completar o cadastro.`,
    );
  }
}

function roundMw(value: number): number {
  return Number(value.toFixed(6));
}

function validatePayload(payload: PwfExportRequest): void {
  if (!payload || typeof payload !== 'object') {
    throw new BadRequestException('Corpo da exportação ausente.');
  }
  for (const field of [
    'referencePwfId',
    'scenarioId',
    'studyName',
    'dataVersion',
  ] as const) {
    if (typeof payload[field] !== 'string' || !payload[field].trim()) {
      throw new BadRequestException(`O campo ${field} é obrigatório.`);
    }
  }
  if (!['observed', 'estimated'].includes(payload.generationSource)) {
    throw new BadRequestException(
      'O campo generationSource deve ser observed ou estimated.',
    );
  }
  if (!Array.isArray(payload.plants) || payload.plants.length === 0) {
    throw new BadRequestException('Selecione ao menos uma usina para exportar.');
  }
  for (const plant of payload.plants) {
    if (
      !plant ||
      typeof plant.generationMw !== 'number' ||
      !Number.isFinite(plant.generationMw) ||
      plant.generationMw < 0 ||
      !plant.mapping
    ) {
      throw new BadRequestException('Há uma usina com dados de exportação inválidos.');
    }
  }
}

export function formatFixedWidthNumber(
  value: number,
  width: number,
  original: string,
): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestException('A geração precisa ser um número não negativo.');
  }

  const trimmed = original.trim();
  const originalDecimals = trimmed.includes('.')
    ? trimmed.length - trimmed.indexOf('.') - 1
    : 0;
  const precisions = Array.from(
    new Set([originalDecimals, 3, 2, 1, 0].filter((item) => item >= 0)),
  );

  for (const precision of precisions) {
    const candidate = value.toFixed(precision);
    if (candidate.length <= width) return candidate.padStart(width);
  }

  throw new UnprocessableEntityException(
    `A geração ${value} MW não cabe no campo PWF de ${width} caracteres.`,
  );
}
