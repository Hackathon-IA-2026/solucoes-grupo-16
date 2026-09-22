import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SupabaseService } from './supabase.service.js';

describe('SupabaseService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_KEY;
    delete process.env.SUPABASE_BUCKET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('reports isConfigured = false when environment variables are absent', () => {
    const service = new SupabaseService();
    service.onModuleInit();
    expect(service.isConfigured()).toBe(false);
    expect(service.getClient()).toBeNull();
  });

  it('uses configured bucket name or defaults to pwf', () => {
    const service = new SupabaseService();
    service.onModuleInit();
    expect(service.getBucketName()).toBe('pwf');

    process.env.SUPABASE_BUCKET = 'meu-bucket';
    const customService = new SupabaseService();
    customService.onModuleInit();
    expect(customService.getBucketName()).toBe('meu-bucket');
  });

  it('throws error when uploadFile is called without client', async () => {
    const service = new SupabaseService();
    service.onModuleInit();
    await expect(
      service.uploadFile('test.txt', Buffer.from('test')),
    ).rejects.toThrow('Supabase client não configurado.');
  });

  it('returns null when downloadFile is called without client', async () => {
    const service = new SupabaseService();
    service.onModuleInit();
    const result = await service.downloadFile('test.txt');
    expect(result).toBeNull();
  });
});
