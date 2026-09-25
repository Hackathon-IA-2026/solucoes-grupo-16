import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ClimateScenarioStorageService } from './climate-scenario-storage.service.js';
import type {
  ClimateScenarioExportManifest,
  ClimateScenarioManifest,
} from './climate-scenario.types.js';

describe('ClimateScenarioStorageService', () => {
  let tempDir: string;
  let service: ClimateScenarioStorageService;
  const scenarioId = '12345678-1234-1234-1234-123456789abc';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'climate-scenario-test-'));
    process.env.SCENARIO_STORAGE_ROOT = tempDir;
    service = new ClimateScenarioStorageService();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    delete process.env.SCENARIO_STORAGE_ROOT;
  });

  it('persiste a entrada, o manifesto e a rastreabilidade da exportação', async () => {
    const csv = Buffer.from('timestamp_utc,usina_id\n2024-01-01T00:00:00Z,A\n');
    const scenario = sampleScenario(scenarioId, csv);
    await service.saveScenario(scenario, csv);

    expect(await service.getScenario(scenarioId)).toEqual(scenario);
    expect(await readFile(join(tempDir, scenarioId, 'input.csv'))).toEqual(csv);

    const output = Buffer.from('pwf');
    const exported: ClimateScenarioExportManifest = {
      schemaVersion: 'climagrid-pwf-export-v1',
      id: '87654321-4321-4321-4321-cba987654321',
      scenarioId,
      createdAt: '2026-09-25T12:01:00.000Z',
      studyName: 'Teste',
      referencePwf: { id: 'ref', name: 'base.pwf', sha256: 'a'.repeat(64) },
      output: {
        filename: 'base_climagrid.pwf',
        sizeBytes: output.length,
        sha256: createHash('sha256').update(output).digest('hex'),
        modifiedBuses: [123],
      },
      selection: {
        selectedPlantIds: ['A'],
        unselectedPlantIds: [],
        unselectedPlantBehavior: 'preserve_reference_pwf_pg',
      },
      allocations: [{
        plantId: 'A', onsId: 'A', busNumber: 123,
        allocationFactor: 1, generationMw: 10,
      }],
    };
    await service.saveExport(exported, output);

    const trace = await service.getTrace(scenarioId);
    expect(trace.exports).toEqual([exported]);
    expect(await readFile(join(
      tempDir, scenarioId, 'exports', exported.id, 'output.pwf',
    ), 'utf8')).toBe('pwf');
  });
});

function sampleScenario(id: string, csv: Buffer): ClimateScenarioManifest {
  return {
    schemaVersion: 'climagrid-climate-scenario-v1',
    id,
    createdAt: '2026-09-25T12:00:00.000Z',
    subsystem: 'NE',
    timestamp: '2024-01-01T00:00:00+00:00',
    resolutionMinutes: 60,
    generationSource: 'PHYSICAL_CURVE',
    weatherSource: 'USER',
    dataVersion: `user-csv-sha256-${'c'.repeat(64)}`,
    input: {
      schemaVersion: 'normalized-ons-hourly-v1',
      name: 'entrada.csv',
      sizeBytes: csv.length,
      sha256: createHash('sha256').update(csv).digest('hex'),
      mediaType: 'text/csv',
      rowCount: 1,
    },
    provenance: {
      catalogSha256: 'd'.repeat(64),
      mappingSha256: null,
      estimatorVersion: 'physical-curve-v1',
      physicalCurve: { cutInMs: 3, ratedMs: 12, cutOutMs: 25 },
    },
    observations: [{
      id: 'A', onsId: 'A', estimatedGenerationMw: 10,
      mappingCoveragePercent: 100,
    }],
    warnings: [],
  };
}
