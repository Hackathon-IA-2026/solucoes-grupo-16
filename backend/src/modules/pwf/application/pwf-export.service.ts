import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { basename, extname } from 'node:path';
import { PwfStorageService } from '../storage/pwf-storage.service.js';

export interface PwfExportPlant {
  plantId: string;
  onsId: string;
  estimatedGenerationMw: number;
  mapping: {
    busNumber: string;
    busName: string;
    nominalVoltageKv: string;
    area: string;
  };
}

export interface PwfExportRequest {
  referencePwfId: string;
  scenarioId: string;
  studyName: string;
  modelVersion: string;
  dataVersion: string;
  plants: PwfExportPlant[];
}

export interface PwfExportResult {
  buffer: Buffer;
  filename: string;
  generatedAt: string;
  modelVersion: string;
  dataVersion: string;
  modifiedBuses: number[];
}

@Injectable()
export class PwfExportService {
  constructor(private readonly storage: PwfStorageService) {}

  async export(payload: PwfExportRequest): Promise<PwfExportResult> {
    validatePayload(payload);

    const [metadata, index, original] = await Promise.all([
      this.storage.getMetadata(payload.referencePwfId),
      this.storage.getIndex(payload.referencePwfId),
      this.storage.getOriginalPwf(payload.referencePwfId),
    ]);
    const output = Buffer.from(original);
    const busesByNumber = new Map(index.buses.map((bus) => [bus.number, bus]));
    const seenBuses = new Set<number>();
    const modifiedBuses: number[] = [];

    for (const plant of payload.plants) {
      const busNumber = Number(plant.mapping.busNumber);
      if (!Number.isSafeInteger(busNumber) || busNumber <= 0) {
        throw new BadRequestException(
          `A barra informada para ${plant.onsId || plant.plantId} é inválida.`,
        );
      }
      if (seenBuses.has(busNumber)) {
        throw new BadRequestException(
          `A barra ${busNumber} foi associada a mais de uma usina.`,
        );
      }
      seenBuses.add(busNumber);

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
        plant.estimatedGenerationMw > bus.activeGenerationMaximumMw + 1e-6
      ) {
        throw new UnprocessableEntityException(
          `A geração de ${plant.estimatedGenerationMw} MW excede o limite de ${bus.activeGenerationMaximumMw} MW da barra ${busNumber}.`,
        );
      }

      const field = bus.activeGenerationField;
      const formatted = formatFixedWidthNumber(
        plant.estimatedGenerationMw,
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

    return {
      buffer: output,
      filename: `${stem || 'cenario'}_climagrid${extension.toLowerCase()}`,
      generatedAt: new Date().toISOString(),
      modelVersion: payload.modelVersion,
      dataVersion: payload.dataVersion,
      modifiedBuses,
    };
  }
}

function validatePayload(payload: PwfExportRequest): void {
  if (!payload || typeof payload !== 'object') {
    throw new BadRequestException('Corpo da exportação ausente.');
  }
  for (const field of [
    'referencePwfId',
    'scenarioId',
    'studyName',
    'modelVersion',
    'dataVersion',
  ] as const) {
    if (typeof payload[field] !== 'string' || !payload[field].trim()) {
      throw new BadRequestException(`O campo ${field} é obrigatório.`);
    }
  }
  if (!Array.isArray(payload.plants) || payload.plants.length === 0) {
    throw new BadRequestException('Selecione ao menos uma usina para exportar.');
  }
  for (const plant of payload.plants) {
    if (
      !plant ||
      typeof plant.estimatedGenerationMw !== 'number' ||
      !Number.isFinite(plant.estimatedGenerationMw) ||
      plant.estimatedGenerationMw < 0 ||
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
