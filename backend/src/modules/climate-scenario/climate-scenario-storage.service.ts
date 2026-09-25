import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type {
  ClimateScenarioExportManifest,
  ClimateScenarioManifest,
  ClimateScenarioTrace,
} from './climate-scenario.types.js';

@Injectable()
export class ClimateScenarioStorageService {
  private readonly root = resolve(
    process.env.SCENARIO_STORAGE_ROOT ??
      resolve(process.cwd(), 'data', 'scenarios'),
  );

  async saveScenario(
    manifest: ClimateScenarioManifest,
    inputCsv: Buffer,
  ): Promise<void> {
    assertScenarioId(manifest.id);
    const scenarioRoot = resolve(this.root, manifest.id);
    await mkdir(this.root, { recursive: true });
    await mkdir(scenarioRoot, { recursive: false });
    await Promise.all([
      writeFile(resolve(scenarioRoot, 'input.csv'), inputCsv, { flag: 'wx' }),
      writeFile(
        resolve(scenarioRoot, 'manifest.json'),
        JSON.stringify(
          {
            ...manifest,
            input: { ...manifest.input, name: basename(manifest.input.name) },
          },
          null,
          2,
        ),
        { encoding: 'utf8', flag: 'wx' },
      ),
    ]);
  }

  async getScenario(id: string): Promise<ClimateScenarioManifest> {
    assertScenarioId(id);
    try {
      const [content, input] = await Promise.all([
        readFile(resolve(this.root, id, 'manifest.json'), 'utf8'),
        readFile(resolve(this.root, id, 'input.csv')),
      ]);
      const manifest = JSON.parse(content) as ClimateScenarioManifest;
      assertStoredFile(
        input,
        manifest.input.sizeBytes,
        manifest.input.sha256,
        `CSV do cenário ${id}`,
      );
      return manifest;
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
    await Promise.all([
      writeFile(resolve(exportRoot, 'output.pwf'), output, { flag: 'wx' }),
      writeFile(
        resolve(exportRoot, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        { encoding: 'utf8', flag: 'wx' },
      ),
    ]);
  }

  async getTrace(id: string): Promise<ClimateScenarioTrace> {
    const scenario = await this.getScenario(id);
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
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) {
    throw new NotFoundException(`Cenário climático ${id} não encontrado.`);
  }
}
