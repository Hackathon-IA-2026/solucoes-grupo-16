import { describe, expect, it, vi } from 'vitest';
import { IntegrationController } from './integration.controller.js';
import type { AiServiceClient } from './ai-service.client.js';
import type { ClimateScenarioStorageService } from '../climate-scenario/climate-scenario-storage.service.js';

describe('IntegrationController historical preparation', () => {
  it('passes the background collection state to the client', async () => {
    const replayHistorical = vi.fn().mockResolvedValue({
      status: 'preparing',
      message: 'Baixando ONS e ERA5.',
    });
    const controller = new IntegrationController(
      { replayHistorical } as unknown as AiServiceClient,
      {} as ClimateScenarioStorageService,
    );

    const result = await controller.historical({
      subsystem: 'NE',
      timestamp: '2024-08-15T12:00:00Z',
      resolutionMinutes: 60,
    });

    expect(result).toEqual({ status: 'preparing', message: 'Baixando ONS e ERA5.' });
    expect(replayHistorical).toHaveBeenCalledWith({
      subsystem: 'NE',
      timestamp: '2024-08-15T12:00:00.000Z',
      resolution_minutes: 60,
    });
  });

  it('passes the ERA5 scenario preparation state to the client', async () => {
    const estimateClimateEra5 = vi.fn().mockResolvedValue({
      status: 'preparing',
      message: 'Baixando e processando o ERA5.',
    });
    const controller = new IntegrationController(
      { estimateClimateEra5 } as unknown as AiServiceClient,
      {} as ClimateScenarioStorageService,
    );

    const result = await controller.estimateEra5Scenario({
      timestamp: '2024-08-15T12:00:00Z',
      availability: 0.95,
    });

    expect(result).toEqual({
      status: 'preparing',
      message: 'Baixando e processando o ERA5.',
    });
    expect(estimateClimateEra5).toHaveBeenCalledWith(
      '2024-08-15T12:00:00.000Z',
      0.95,
    );
  });
});
