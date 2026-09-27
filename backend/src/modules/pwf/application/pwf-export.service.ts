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
    operation?: 'A' | 'E' | 'M';
    state?: '0' | '1' | '2';
  };
}

export type PwfExportMode = 'reference' | 'dbar';

export interface PwfExportRequest {
  exportMode?: PwfExportMode;
  referencePwfId?: string;
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
  exportMode: PwfExportMode;
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
    const exportMode = payload.exportMode ?? 'reference';

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

    const generationByBus = new Map<
      number,
      {
        generationMw: number;
        plantLabels: string[];
        busName: string;
        operation?: 'A' | 'E' | 'M';
        state?: '0' | '1' | '2';
      }
    >();

    for (const plant of plants) {
      const busNumber = Number(plant.mapping.busNumber);
      if (!Number.isSafeInteger(busNumber) || busNumber <= 0 || busNumber >= 99999) {
        throw new BadRequestException(
          `A barra informada para ${plant.onsId || plant.plantId} é inválida.`,
        );
      }
      const operation = plant.mapping.operation;
      const state = plant.mapping.state;
      const accumulated = generationByBus.get(busNumber) ?? {
        generationMw: 0,
        plantLabels: [],
        busName: plant.mapping.busName,
        operation,
        state,
      };
      if (accumulated.operation !== operation || accumulated.state !== state) {
        throw new BadRequestException(
          `As alocações da barra ${busNumber} devem usar a mesma operação e o mesmo estado.`,
        );
      }
      accumulated.generationMw += plant.generationMw;
      accumulated.plantLabels.push(plant.onsId || plant.plantId);
      generationByBus.set(busNumber, accumulated);
    }

    let output: Buffer;
    let filename: string;
    let reference:
      | { id: string; name: string; sha256: string }
      | null = null;
    if (exportMode === 'reference') {
      const referencePwfId = payload.referencePwfId!;
      const [metadata, index, original] = await Promise.all([
        this.storage.getMetadata(referencePwfId),
        this.storage.getIndex(referencePwfId),
        this.storage.getOriginalPwf(referencePwfId),
      ]);
      output = Buffer.from(original);
      const busesByNumber = new Map(index.buses.map((bus) => [bus.number, bus]));
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
        if (allocation.operation !== undefined) {
          writeTextField(
            output,
            bus.operationField ?? {
              byteOffset: bus.activeGenerationField.byteOffset - 27,
              width: 1,
            },
            allocation.operation,
            busNumber,
          );
        }
        if (allocation.state !== undefined) {
          writeTextField(
            output,
            bus.stateField ?? {
              byteOffset: bus.activeGenerationField.byteOffset - 26,
              width: 1,
            },
            allocation.state,
            busNumber,
          );
        }
        writeTextField(
          output,
          bus.activeGenerationField,
          formatFixedWidthNumber(
            allocation.generationMw,
            bus.activeGenerationField.width,
            bus.activeGenerationField.rawValue,
          ),
          busNumber,
        );
      }
      const extension = extname(metadata.name) || '.pwf';
      const stem = safeFilenameStem(basename(metadata.name, extension));
      filename = `${stem || 'cenario'}_climagrid${extension.toLowerCase()}`;
      reference = {
        id: metadata.id,
        name: metadata.name,
        sha256: metadata.sha256,
      };
    } else {
      output = createDbarChangeFile(generationByBus);
      filename = `${safeFilenameStem(payload.studyName) || 'cenario'}_climagrid_dbar.pwf`;
    }
    const modifiedBuses = [...generationByBus.keys()].sort((a, b) => a - b);
    const generatedAt = new Date().toISOString();
    const outputSha256 = createHash('sha256').update(output).digest('hex');

    let exportId: string | undefined;
    if (scenario && this.scenarios) {
      exportId = randomUUID();
      const selected = new Set(selectedPlantIds);
      await this.scenarios.saveExport({
        schemaVersion: 'climagrid-pwf-export-v2',
        id: exportId,
        scenarioId: scenario.id,
        createdAt: generatedAt,
        studyName: payload.studyName,
        exportMode,
        referencePwf: reference,
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
          unselectedPlantBehavior: exportMode === 'reference'
            ? 'preserve_reference_pwf_pg'
            : 'omit_from_dbar_change_file',
        },
        allocations: plants.map((plant) => ({
          plantId: plant.plantId,
          onsId: plant.onsId,
          busNumber: Number(plant.mapping.busNumber),
          allocationFactor: plant.mapping.allocationFactor!,
          generationMw: plant.generationMw,
          operation: plant.mapping.operation ?? 'M',
          state: plant.mapping.state ?? '0',
        })),
      }, output);
    }

    return {
      buffer: output,
      filename,
      generatedAt,
      generationSource: payload.generationSource,
      dataVersion: payload.dataVersion,
      exportMode,
      modifiedBuses,
      exportId,
      outputSha256,
      referenceSha256: reference?.sha256,
    };
  }
}

function authoritativeEstimatedPlants(
  payload: PwfExportRequest,
  scenario: ClimateScenarioManifest,
): { plants: PwfExportPlant[]; selectedPlantIds: string[] } {
  if (
    payload.dataVersion !== scenario.dataVersion ||
    !['PHYSICAL_CURVE', 'MODEL'].includes(scenario.generationSource)
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
  const exportMode = payload.exportMode ?? 'reference';
  if (!['reference', 'dbar'].includes(exportMode)) {
    throw new BadRequestException('O campo exportMode deve ser reference ou dbar.');
  }
  for (const field of ['scenarioId', 'studyName', 'dataVersion'] as const) {
    if (typeof payload[field] !== 'string' || !payload[field].trim()) {
      throw new BadRequestException(`O campo ${field} é obrigatório.`);
    }
  }
  if (
    exportMode === 'reference' &&
    (typeof payload.referencePwfId !== 'string' || !payload.referencePwfId.trim())
  ) {
    throw new BadRequestException('O campo referencePwfId é obrigatório no modo reference.');
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
    if (
      plant.mapping.operation !== undefined &&
      !['A', 'E', 'M'].includes(plant.mapping.operation)
    ) {
      throw new BadRequestException('Há uma operação DBAR inválida.');
    }
    if (
      plant.mapping.state !== undefined &&
      !['0', '1', '2'].includes(plant.mapping.state)
    ) {
      throw new BadRequestException('Há um estado DBAR inválido.');
    }
  }
}

const DBAR_HEADER = '(Num)OETGb(   nome   )Gl( V)( A)( Pg)( Qg)( Qn)( Qm)(Bc  )( Pl)( Ql)( Sh)Are(Vf)M(1)(2)(3)(4)(5)(6)(7)(8)(9)(10';

function createDbarChangeFile(
  generationByBus: Map<number, {
    generationMw: number;
    busName: string;
    operation?: 'A' | 'E' | 'M';
    state?: '0' | '1' | '2';
  }>,
): Buffer {
  const records = [...generationByBus.entries()]
    .sort(([left], [right]) => left - right)
    .map(([busNumber, allocation]) => {
      const record = Array<string>(DBAR_HEADER.length).fill(' ');
      putFixed(record, 0, 5, String(busNumber), 'right');
      putFixed(record, 5, 6, allocation.operation ?? 'M');
      putFixed(record, 6, 7, allocation.state ?? '0');
      putFixed(record, 10, 22, allocation.busName || `BARRA ${busNumber}`);
      putFixed(
        record,
        32,
        37,
        formatFixedWidthNumber(allocation.generationMw, 5, '0.0'),
      );
      return record.join('').trimEnd();
    });
  return Buffer.from(
    ['DBAR', DBAR_HEADER, ...records, '99999', '', 'FIM', ''].join('\r\n'),
    'latin1',
  );
}

function putFixed(
  output: string[],
  start: number,
  end: number,
  value: string,
  alignment: 'left' | 'right' = 'left',
): void {
  const width = end - start;
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const formatted = alignment === 'right'
    ? normalized.padStart(width)
    : normalized.padEnd(width);
  output.splice(start, width, ...formatted.slice(0, width));
}

function writeTextField(
  output: Buffer,
  field: { byteOffset: number; width: number },
  value: string,
  busNumber: number,
): void {
  const fieldEnd = field.byteOffset + field.width;
  if (field.byteOffset < 0 || fieldEnd > output.length || value.length !== field.width) {
    throw new UnprocessableEntityException(
      `O índice da barra ${busNumber} não corresponde ao arquivo PWF armazenado.`,
    );
  }
  output.write(value, field.byteOffset, field.width, 'latin1');
}

function safeFilenameStem(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120);
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
