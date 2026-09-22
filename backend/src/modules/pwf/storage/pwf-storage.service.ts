import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  PwfReferenceCaseIndex,
  PwfReferenceCaseMetadata,
} from '../domain/pwf.types.js';
import { SupabaseService } from '../../supabase/supabase.service.js';

@Injectable()
export class PwfStorageService {
  private readonly logger = new Logger(PwfStorageService.name);
  private readonly root = resolve(
    process.env.PWF_STORAGE_ROOT ?? resolve(process.cwd(), 'data', 'pwf'),
  );

  constructor(
    @Optional() private readonly supabase?: SupabaseService,
  ) {}

  async saveReferenceCase(
    metadata: PwfReferenceCaseMetadata,
    original: Buffer,
    index: PwfReferenceCaseIndex,
  ): Promise<void> {
    const referenceRoot = resolve(this.root, 'reference-cases');
    const caseRoot = resolve(referenceRoot, metadata.id);
    await mkdir(referenceRoot, { recursive: true });
    await mkdir(caseRoot, { recursive: false });

    const metadataJson = JSON.stringify(metadata, null, 2);
    const indexJson = JSON.stringify(index);

    // 1. Sempre persiste no disco local (cache/fallback imediato)
    await Promise.all([
      writeFile(resolve(caseRoot, 'original.pwf'), original, { flag: 'wx' }),
      writeFile(resolve(caseRoot, 'metadata.json'), metadataJson, {
        encoding: 'utf8',
        flag: 'wx',
      }),
      writeFile(resolve(caseRoot, 'parsed-index.json'), indexJson, {
        encoding: 'utf8',
        flag: 'wx',
      }),
    ]);

    // 2. Se o Supabase estiver configurado, envia os arquivos para o bucket
    if (this.supabase?.isConfigured()) {
      const basePath = `reference-cases/${metadata.id}`;
      await Promise.all([
        this.supabase.uploadFile(
          `${basePath}/original.pwf`,
          original,
          'text/plain; charset=latin1',
        ),
        this.supabase.uploadFile(
          `${basePath}/metadata.json`,
          metadataJson,
          'application/json',
        ),
        this.supabase.uploadFile(
          `${basePath}/parsed-index.json`,
          indexJson,
          'application/json',
        ),
      ]);

      this.logger.log(
        `Caso ${metadata.id} (${metadata.name}) salvo no bucket "${this.supabase.getBucketName()}" do Supabase Storage.`,
      );

      // 3. Sincroniza metadados com tabela do Postgres do Supabase (se existir)
      await this.supabase.saveReferenceCaseRecord({
        id: metadata.id,
        name: metadata.name,
        size_bytes: metadata.sizeBytes,
        sha256: metadata.sha256,
        uploaded_at: metadata.uploadedAt,
        status: metadata.status,
        anarede_version: metadata.anaredeVersion,
        compatibility: metadata.compatibility,
        encoding: metadata.encoding,
        line_ending: metadata.lineEnding,
        title: metadata.title,
        study_year: metadata.studyYear,
        bus_count: metadata.busCount,
        generator_bus_count: metadata.generatorBusCount,
        generator_group_count: metadata.generatorGroupCount,
        storage_path: `${basePath}/original.pwf`,
        warnings: metadata.warnings,
        metadata: metadata as unknown as Record<string, unknown>,
      });
    }
  }

  async getMetadata(id: string): Promise<PwfReferenceCaseMetadata> {
    assertReferenceCaseId(id);

    // Tenta primeiro via Supabase Storage se configurado
    if (this.supabase?.isConfigured()) {
      const buffer = await this.supabase.downloadFile(
        `reference-cases/${id}/metadata.json`,
      );
      if (buffer) {
        try {
          return JSON.parse(buffer.toString('utf8')) as PwfReferenceCaseMetadata;
        } catch {
          this.logger.warn(
            `Falha ao parsear metadata.json do Supabase para caso ${id}, tentando fallback local.`,
          );
        }
      }
    }

    return this.readJson<PwfReferenceCaseMetadata>(id, 'metadata.json');
  }

  async getIndex(id: string): Promise<PwfReferenceCaseIndex> {
    assertReferenceCaseId(id);

    // Tenta primeiro via Supabase Storage se configurado
    if (this.supabase?.isConfigured()) {
      const buffer = await this.supabase.downloadFile(
        `reference-cases/${id}/parsed-index.json`,
      );
      if (buffer) {
        try {
          return JSON.parse(buffer.toString('utf8')) as PwfReferenceCaseIndex;
        } catch {
          this.logger.warn(
            `Falha ao parsear parsed-index.json do Supabase para caso ${id}, tentando fallback local.`,
          );
        }
      }
    }

    return this.readJson<PwfReferenceCaseIndex>(id, 'parsed-index.json');
  }

  async getOriginalPwf(id: string): Promise<Buffer> {
    assertReferenceCaseId(id);

    if (this.supabase?.isConfigured()) {
      const buffer = await this.supabase.downloadFile(
        `reference-cases/${id}/original.pwf`,
      );
      if (buffer) {
        return buffer;
      }
    }

    try {
      return await readFile(
        resolve(this.root, 'reference-cases', id, 'original.pwf'),
      );
    } catch {
      throw new NotFoundException(`Arquivo PWF do caso ${id} não encontrado.`);
    }
  }

  getPwfUrl(id: string): string | null {
    assertReferenceCaseId(id);
    if (!this.supabase?.isConfigured()) return null;
    return this.supabase.getPublicUrl(`reference-cases/${id}/original.pwf`);
  }

  private async readJson<T>(id: string, filename: string): Promise<T> {
    assertReferenceCaseId(id);
    try {
      const content = await readFile(
        resolve(this.root, 'reference-cases', id, filename),
        'utf8',
      );
      return JSON.parse(content) as T;
    } catch {
      throw new NotFoundException(`Caso PWF ${id} não encontrado.`);
    }
  }
}

function assertReferenceCaseId(id: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) {
    throw new NotFoundException(`Caso PWF ${id} não encontrado.`);
  }
}
