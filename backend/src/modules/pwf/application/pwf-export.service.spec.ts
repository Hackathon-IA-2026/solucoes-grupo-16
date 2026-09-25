import { describe, expect, it, vi } from 'vitest';
import {
  formatFixedWidthNumber,
  PwfExportService,
} from './pwf-export.service.js';
import type { PwfStorageService } from '../storage/pwf-storage.service.js';

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
});
