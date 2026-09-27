import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type {
  ClimateScenarioExportManifest,
  ClimateScenarioManifest,
  ClimateScenarioTrace,
} from './climate-scenario.types.js';
import { SupabaseService } from '../supabase/supabase.service.js';

@Injectable()
export class ClimateScenarioStorageService {
  private readonly logger = new Logger(ClimateScenarioStorageService.name);
  private readonly root = resolve(
    process.env.SCENARIO_STORAGE_ROOT ??
      resolve(process.cwd(), 'data', 'scenarios'),
  );

  constructor(@Optional() private readonly supabase?: SupabaseService) {}

  async saveScenario(
    manifest: ClimateScenarioManifest,
    inputCsv: Buffer,
  ): Promise<void> {
    assertScenarioId(manifest.id);
    const scenarioRoot = resolve(this.root, manifest.id);
    await mkdir(this.root, { recursive: true });
    await mkdir(scenarioRoot, { recursive: false });
    const storedManifest = JSON.stringify(
      {
        ...manifest,
        input: { ...manifest.input, name: basename(manifest.input.name) },
      },
      null,
      2,
    );
    await Promise.all([
      writeFile(resolve(scenarioRoot, 'input.csv'), inputCsv, { flag: 'wx' }),
      writeFile(resolve(scenarioRoot, 'manifest.json'), storedManifest, {
        encoding: 'utf8',
        flag: 'wx',
      }),
    ]);

    if (this.supabase?.isConfigured()) {
      const basePath = this.scenarioPath(manifest.id);
      await Promise.all([
        this.supabase.uploadFile(
          `${basePath}/input.csv`,
          inputCsv,
          'text/csv; charset=utf-8',
        ),
        this.supabase.uploadFile(
          `${basePath}/manifest.json`,
          storedManifest,
          'application/json',
        ),
      ]);
      this.logger.log(
        `Cenário ${manifest.id} sincronizado no bucket "${this.supabase.getBucketName()}" do Supabase Storage.`,
      );
    }
  }

  async getScenario(id: string): Promise<ClimateScenarioManifest> {
    assertScenarioId(id);
    if (this.supabase?.isConfigured()) {
      const basePath = this.scenarioPath(id);
      const [content, input] = await Promise.all([
        this.supabase.downloadFile(`${basePath}/manifest.json`),
        this.supabase.downloadFile(`${basePath}/input.csv`),
      ]);
      if (content && input) {
        try {
          return this.parseAndValidateScenario(
            id,
            content.toString('utf8'),
            input,
          );
        } catch (error) {
          if (error instanceof InternalServerErrorException) throw error;
          this.logger.warn(
            `Manifesto do cenário ${id} no Supabase é inválido; tentando fallback local.`,
          );
        }
      }
    }

    try {
      const [content, input] = await Promise.all([
        readFile(resolve(this.root, id, 'manifest.json'), 'utf8'),
        readFile(resolve(this.root, id, 'input.csv')),
      ]);
      return this.parseAndValidateScenario(id, content, input);
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      throw new NotFoundException(`Cenário climático ${id} não encontrado.`);
    }
  }

  async saveExport(
    manifest: ClimateScenarioExportManifest,
    output: Buffer,
  ): Promise<void> {
    assertScenarioId(manifest.scenarioId);
    assertScenarioId(manifest.id);
    await this.getScenario(manifest.scenarioId);
    const exportRoot = resolve(
      this.root,
      manifest.scenarioId,
      'exports',
      manifest.id,
    );
    await mkdir(resolve(this.root, manifest.scenarioId, 'exports'), {
      recursive: true,
    });
    await mkdir(exportRoot, { recursive: false });
    const storedManifest = JSON.stringify(manifest, null, 2);
    await Promise.all([
      writeFile(resolve(exportRoot, 'output.pwf'), output, { flag: 'wx' }),
      writeFile(resolve(exportRoot, 'manifest.json'), storedManifest, {
        encoding: 'utf8',
        flag: 'wx',
      }),
    ]);

    if (this.supabase?.isConfigured()) {
      const basePath = `${this.scenarioPath(manifest.scenarioId)}/exports/${manifest.id}`;
      await Promise.all([
        this.supabase.uploadFile(
          `${basePath}/output.pwf`,
          output,
          'text/plain; charset=latin1',
        ),
        this.supabase.uploadFile(
          `${basePath}/manifest.json`,
          storedManifest,
          'application/json',
        ),
      ]);
      this.logger.log(
        `Exportação ${manifest.id} do cenário ${manifest.scenarioId} sincronizada no Supabase Storage.`,
      );
    }
  }

  async getTrace(id: string): Promise<ClimateScenarioTrace> {
    const scenario = await this.getScenario(id);
    const remoteExportIds = this.supabase?.isConfigured()
      ? await this.supabase.listFolder(`${this.scenarioPath(id)}/exports`)
      : null;
    if (remoteExportIds !== null) {
      const exportIds = remoteExportIds.filter(isScenarioId).sort();
      const exports = await Promise.all(
        exportIds.map((exportId) => this.getRemoteExport(id, exportId)),
      );
      return { ...scenario, exports };
    }

    let exportIds: string[] = [];
    try {
      exportIds = await readdir(resolve(this.root, id, 'exports'));
    } catch {
      // Um cenário ainda não exportado possui rastreabilidade válida.
    }
    const exports = await Promise.all(
      exportIds.sort().map(async (exportId) => {
        const exportRoot = resolve(this.root, id, 'exports', exportId);
        const [content, output] = await Promise.all([
          readFile(resolve(exportRoot, 'manifest.json'), 'utf8'),
          readFile(resolve(exportRoot, 'output.pwf')),
        ]);
        const manifest = JSON.parse(content) as ClimateScenarioExportManifest;
        assertStoredFile(
          output,
          manifest.output.sizeBytes,
          manifest.output.sha256,
          `PWF exportado ${exportId}`,
        );
        return manifest;
      }),
    );
    return { ...scenario, exports };
  }

  private scenarioPath(id: string): string {
    return `climate-scenarios/${id}`;
  }

  private parseAndValidateScenario(
    id: string,
    content: string,
    input: Buffer,
  ): ClimateScenarioManifest {
    const manifest = JSON.parse(content) as ClimateScenarioManifest;
    assertStoredFile(
      input,
      manifest.input.sizeBytes,
      manifest.input.sha256,
      `CSV do cenário ${id}`,
    );
    return manifest;
  }

  private async getRemoteExport(
    scenarioId: string,
    exportId: string,
  ): Promise<ClimateScenarioExportManifest> {
    if (!this.supabase) {
      throw new NotFoundException(
        `Exportação ${exportId} do cenário ${scenarioId} não encontrada.`,
      );
    }
    const basePath = `${this.scenarioPath(scenarioId)}/exports/${exportId}`;
    const [content, output] = await Promise.all([
      this.supabase.downloadFile(`${basePath}/manifest.json`),
      this.supabase.downloadFile(`${basePath}/output.pwf`),
    ]);
    if (!content || !output) {
      throw new NotFoundException(
        `Exportação ${exportId} do cenário ${scenarioId} não encontrada.`,
      );
    }
    const manifest = JSON.parse(
      content.toString('utf8'),
    ) as ClimateScenarioExportManifest;
    assertStoredFile(
      output,
      manifest.output.sizeBytes,
      manifest.output.sha256,
      `PWF exportado ${exportId}`,
    );
    return manifest;
  }
}

function assertStoredFile(
  content: Buffer,
  expectedSize: number,
  expectedSha256: string,
  label: string,
): void {
  const sha256 = createHash('sha256').update(content).digest('hex');
  if (content.length !== expectedSize || sha256 !== expectedSha256) {
    throw new InternalServerErrorException(
      `${label} não corresponde ao manifesto persistido.`,
    );
  }
}

function assertScenarioId(id: string): void {
  if (!isScenarioId(id)) {
    throw new NotFoundException(`Cenário climático ${id} não encontrado.`);
  }
}

function isScenarioId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id);
}
