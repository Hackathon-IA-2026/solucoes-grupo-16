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
});
