import { describe, expect, it, vi } from 'vitest';
import {
  formatFixedWidthNumber,
  PwfExportService,
} from './pwf-export.service.js';
import type { PwfStorageService } from '../storage/pwf-storage.service.js';
import type { ClimateScenarioStorageService } from '../../climate-scenario/climate-scenario-storage.service.js';
import type { ClimateScenarioManifest } from '../../climate-scenario/climate-scenario.types.js';

describe('PwfExportService', () => {
  it('altera somente o campo Pg da barra mapeada', async () => {
    const original = Buffer.from('prefixo100.0sufixo', 'latin1');
    const storage = {
      getMetadata: vi.fn().mockResolvedValue({ name: 'caso-base.pwf' }),
      getIndex: vi.fn().mockResolvedValue({
        buses: [
          {
            number: 123,
            status: 'L',
            type: 1,
            activeGenerationField: {
              value: 100,
              byteOffset: 7,
              width: 5,
              rawValue: '100.0',
            },
          },
        ],
        generatorGroups: [],
      }),
      getOriginalPwf: vi.fn().mockResolvedValue(original),
    } as unknown as PwfStorageService;
    const service = new PwfExportService(storage);

    const result = await service.export({
      referencePwfId: '12345678-1234-1234-1234-123456789abc',
      scenarioId: 'cenario-1',
      studyName: 'Cenário teste',
      generationSource: 'observed',
      dataVersion: 'snapshot-teste',
      plants: [
        {
          plantId: 'plant-1',
          onsId: 'ONS_1',
          generationMw: 87.5,
          mapping: {
            busNumber: '123',
            busName: 'PARQUE',
            nominalVoltageKv: '230',
            area: '5',
          },
        },
      ],
    });

    expect(result.buffer.toString('latin1')).toBe('prefixo 87.5sufixo');
    expect(original.toString('latin1')).toBe('prefixo100.0sufixo');
    expect(result.modifiedBuses).toEqual([123]);
    expect(result.generationSource).toBe('observed');
    expect(result.filename).toBe('caso-base_climagrid.pwf');
  });

  it('preserva a largura fixa ao reduzir a precisão', () => {
    expect(formatFixedWidthNumber(123.456, 5, '100.0')).toBe('123.5');
    expect(formatFixedWidthNumber(9, 5, '100.0')).toBe('  9.0');
  });

  it('soma parcelas de diferentes conjuntos associadas à mesma barra', async () => {
    const storage = {
      getMetadata: vi.fn().mockResolvedValue({ name: 'caso-base.pwf' }),
      getIndex: vi.fn().mockResolvedValue({
        buses: [{
          number: 123,
          status: 'L',
          type: 1,
          activeGenerationField: { value: 100, byteOffset: 7, width: 5, rawValue: '100.0' },
        }],
        generatorGroups: [],
      }),
      getOriginalPwf: vi.fn().mockResolvedValue(Buffer.from('prefixo100.0sufixo', 'latin1')),
    } as unknown as PwfStorageService;
    const service = new PwfExportService(storage);
    const mapping = { busNumber: '123', busName: 'PARQUE', nominalVoltageKv: '230', area: '5' };

    const result = await service.export({
      referencePwfId: '12345678-1234-1234-1234-123456789abc',
      scenarioId: 'cenario-1',
      studyName: 'Cenário teste',
      generationSource: 'observed',
      dataVersion: 'snapshot-teste',
      plants: [
        { plantId: 'a:123', onsId: 'A', generationMw: 40, mapping },
        { plantId: 'b:123', onsId: 'B', generationMw: 47.5, mapping },
      ],
    });

    expect(result.buffer.toString('latin1')).toBe('prefixo 87.5sufixo');
    expect(result.modifiedBuses).toEqual([123]);
  });

  it('rejeita geração estimada alterada pelo cliente', async () => {
    const storage = exportStorage();
    const scenario = estimatedScenario(100);
    const scenarios = {
      getScenario: vi.fn().mockResolvedValue(scenario),
      saveExport: vi.fn(),
    } as unknown as ClimateScenarioStorageService;
    const service = new PwfExportService(storage, scenarios);

    await expect(service.export({
      referencePwfId: '12345678-1234-1234-1234-123456789abc',
      scenarioId: scenario.id,
      studyName: 'Cenário adulterado',
      generationSource: 'estimated',
      dataVersion: scenario.dataVersion,
      selectedPlantIds: ['ONS_1'],
      plants: [{
        plantId: 'ONS_1',
        onsId: 'ONS_1',
        generationMw: 99,
        mapping: {
          busNumber: '123', busName: 'PARQUE', nominalVoltageKv: '230',
          area: '5', allocationFactor: 1,
        },
      }],
    })).rejects.toThrow('não corresponde à estimativa persistida');
    expect(scenarios.saveExport).not.toHaveBeenCalled();
  });

  it('bloqueia cenário com mapeamento cadastral parcial', async () => {
    const storage = exportStorage();
    const scenario = estimatedScenario(100, 75);
    const scenarios = {
      getScenario: vi.fn().mockResolvedValue(scenario),
      saveExport: vi.fn(),
    } as unknown as ClimateScenarioStorageService;
    const service = new PwfExportService(storage, scenarios);

    await expect(service.export({
      referencePwfId: '12345678-1234-1234-1234-123456789abc',
      scenarioId: scenario.id,
      studyName: 'Cobertura parcial',
      generationSource: 'estimated',
      dataVersion: scenario.dataVersion,
      selectedPlantIds: ['ONS_1'],
      plants: [{
        plantId: 'ONS_1', onsId: 'ONS_1', generationMw: 100,
        mapping: {
          busNumber: '123', busName: 'PARQUE', nominalVoltageKv: '230',
          area: '5', allocationFactor: 1,
        },
      }],
    })).rejects.toThrow('mapeamento PWF parcial');
  });

  it('exporta a estimativa persistida de um cenário LightGBM', async () => {
    const storage = exportStorage();
    const scenario = estimatedScenario(87.5, 100, 'MODEL');
    const scenarios = {
      getScenario: vi.fn().mockResolvedValue(scenario),
      saveExport: vi.fn(),
    } as unknown as ClimateScenarioStorageService;
    const service = new PwfExportService(storage, scenarios);

    const result = await service.export({
      referencePwfId: '12345678-1234-1234-1234-123456789abc',
      scenarioId: scenario.id,
      studyName: 'Cenário LightGBM',
      generationSource: 'estimated',
      dataVersion: scenario.dataVersion,
      selectedPlantIds: ['ONS_1'],
      plants: [{
        plantId: 'ONS_1', onsId: 'ONS_1', generationMw: 87.5,
        mapping: {
          busNumber: '123', busName: 'PARQUE', nominalVoltageKv: '230',
          area: '5', allocationFactor: 1,
        },
      }],
    });

    expect(result.buffer.toString('latin1')).toBe('prefixo 87.5sufixo');
    expect(scenarios.saveExport).toHaveBeenCalledOnce();
  });
});

function exportStorage(): PwfStorageService {
  return {
    getMetadata: vi.fn().mockResolvedValue({
      id: '12345678-1234-1234-1234-123456789abc',
      name: 'caso-base.pwf',
      sha256: 'a'.repeat(64),
    }),
    getIndex: vi.fn().mockResolvedValue({
      buses: [{
        number: 123,
        status: 'L',
        type: 1,
        activeGenerationField: {
          value: 100, byteOffset: 7, width: 5, rawValue: '100.0',
        },
      }],
      generatorGroups: [],
    }),
    getOriginalPwf: vi.fn().mockResolvedValue(
      Buffer.from('prefixo100.0sufixo', 'latin1'),
    ),
  } as unknown as PwfStorageService;
}

function estimatedScenario(
  estimatedGenerationMw: number,
  mappingCoveragePercent = 100,
  generationSource: 'PHYSICAL_CURVE' | 'MODEL' = 'PHYSICAL_CURVE',
): ClimateScenarioManifest {
  return {
    schemaVersion: 'climagrid-climate-scenario-v1',
    id: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-09-25T12:00:00.000Z',
    subsystem: 'NE',
    timestamp: '2024-01-15T12:00:00+00:00',
    resolutionMinutes: 60,
    generationSource,
    weatherSource: 'USER',
    dataVersion: 'user-csv-sha256-test',
    input: {
      schemaVersion: 'normalized-ons-hourly-v1',
      name: 'cenario.csv', sizeBytes: 1, sha256: 'b'.repeat(64),
      mediaType: 'text/csv', rowCount: 1,
    },
    provenance: {
      catalogSha256: 'c'.repeat(64), mappingSha256: null,
      estimatorVersion: 'physical-curve-v1',
      physicalCurve: { cutInMs: 3, ratedMs: 12, cutOutMs: 25 },
    },
    observations: [{
      id: 'ONS_1', onsId: 'ONS_1', estimatedGenerationMw,
      mappingCoveragePercent,
    }],
    warnings: [],
  };
}
