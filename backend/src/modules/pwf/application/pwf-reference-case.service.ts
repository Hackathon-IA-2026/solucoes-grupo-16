import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type {
  PwfGenerationTarget,
  PwfReferenceCaseMetadata,
} from '../domain/pwf.types.js';
import {
  PwfParseError,
  PwfParserService,
} from '../parser/pwf-parser.service.js';
import { PwfStorageService } from '../storage/pwf-storage.service.js';

export interface UploadedPwfFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class PwfReferenceCaseService {
  constructor(
    private readonly parser: PwfParserService,
    private readonly storage: PwfStorageService,
  ) {}

  async upload(file?: UploadedPwfFile): Promise<PwfReferenceCaseMetadata> {
    if (!file) {
      throw new BadRequestException(
        'Envie o arquivo no campo multipart "file".',
      );
    }
    if (!file.originalname.toLowerCase().endsWith('.pwf')) {
      throw new BadRequestException('O arquivo precisa ter extensão .pwf.');
    }

    try {
      const parsed = this.parser.parse(file.buffer);
      const id = randomUUID();
      const generatorBusCount = parsed.buses.filter(
        (bus) =>
          bus.type === 1 ||
          bus.type === 2 ||
          bus.activeGenerationMw !== 0 ||
          parsed.generatorGroups.some(
            (group) => group.busNumber === bus.number,
          ),
      ).length;
      const metadata: PwfReferenceCaseMetadata = {
        id,
        name: basename(file.originalname),
        sizeBytes: file.size,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
        uploadedAt: new Date().toISOString(),
        status: 'valid',
        anaredeVersion: parsed.anaredeVersion,
        compatibility: parsed.compatibility,
        encoding: parsed.encoding,
        lineEnding: parsed.lineEnding,
        title: parsed.title,
        studyYear: parsed.studyYear ?? inferYearFromName(file.originalname),
        busCount: parsed.buses.length,
        generatorBusCount,
        generatorGroupCount: parsed.generatorGroups.length,
        blocks: parsed.blocks,
        warnings: parsed.warnings,
      };

      await this.storage.saveReferenceCase(metadata, file.buffer, {
        buses: parsed.buses,
        generatorGroups: parsed.generatorGroups,
      });
      return metadata;
    } catch (error) {
      if (error instanceof PwfParseError) {
        throw new UnprocessableEntityException(error.message);
      }
      throw error;
    }
  }

  getMetadata(id: string): Promise<PwfReferenceCaseMetadata> {
    return this.storage.getMetadata(id);
  }

  async getGenerationTargets(id: string): Promise<{
    items: PwfGenerationTarget[];
  }> {
    const index = await this.storage.getIndex(id);
    const groupsByBus = new Map<number, typeof index.generatorGroups>();
    for (const group of index.generatorGroups) {
      const groups = groupsByBus.get(group.busNumber) ?? [];
      groups.push(group);
      groupsByBus.set(group.busNumber, groups);
    }

    const items = index.buses
      .filter(
        (bus) =>
          bus.type === 1 ||
          bus.type === 2 ||
          bus.activeGenerationMw !== 0 ||
          groupsByBus.has(bus.number),
      )
      .map<PwfGenerationTarget>((bus) => ({
        kind: 'bus',
        busNumber: bus.number,
        busName: bus.name,
        busType: bus.type,
        area: bus.area,
        baseVoltageKv: bus.baseVoltageKv,
        activeGenerationMw: bus.activeGenerationMw,
        activeGenerationMinimumMw: bus.activeGenerationMinimumMw,
        activeGenerationMaximumMw: bus.activeGenerationMaximumMw,
        editable: bus.status !== 'D' && bus.type !== 2,
        generatorGroups: (groupsByBus.get(bus.number) ?? []).map((group) => ({
          busNumber: group.busNumber,
          groupNumber: group.groupNumber,
          automaticMode: group.automaticMode,
          status: group.status,
          units: group.units,
          unitsOnline: group.unitsOnline,
          activeGenerationPerUnitMw: group.activeGenerationPerUnitMw,
          mechanicalLimitPerUnitMw: group.mechanicalLimitPerUnitMw,
          activeMinimumPerUnitMw: group.activeMinimumPerUnitMw,
        })),
      }))
      .sort((left, right) => left.busNumber - right.busNumber);

    return { items };
  }
}

function inferYearFromName(filename: string): number | undefined {
  const match = filename.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
  return match ? Number(match[1]) : undefined;
}
