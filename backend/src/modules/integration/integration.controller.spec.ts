import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntegrationController } from './integration.controller.js';
import { AiServiceClient } from './ai-service.client.js';
import type { ClimateScenarioStorageService } from '../climate-scenario/climate-scenario-storage.service.js';

describe('IntegrationController historical preparation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('shows a clear error when the AI service URL is missing in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AI_SERVICE_URL', '');

    const client = new AiServiceClient();

    await expect(client.capabilities()).rejects.toMatchObject({
      message: expect.stringContaining('AI_SERVICE_URL'),
      response: { statusCode: 503 },
    });
  });

  it('does not forward a Render HTML error page to the frontend', async () => {
    vi.stubEnv('AI_SERVICE_URL', 'https://ai.example.test');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!DOCTYPE html><title>502</title>', { status: 502 }),
      ),
    );

    const client = new AiServiceClient();

    await expect(client.capabilities()).rejects.toMatchObject({
      message: expect.stringContaining('status HTTP 502'),
      status: 502,
    });
  });

  it('forwards the experimental report without changing its scientific status', async () => {
    const experimentalInsights = vi.fn().mockResolvedValue({
      available: true,
      status: 'exploratory_evidence',
      scientifically_approved: false,
    });
    const controller = new IntegrationController(
      { experimentalInsights } as unknown as AiServiceClient,
      {} as ClimateScenarioStorageService,
    );

    await expect(controller.experimentalInsights()).resolves.toEqual({
      available: true,
      status: 'exploratory_evidence',
      scientifically_approved: false,
    });
    expect(experimentalInsights).toHaveBeenCalledOnce();
  });

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
