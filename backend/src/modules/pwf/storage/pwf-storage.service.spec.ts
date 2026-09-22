import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PwfStorageService } from './pwf-storage.service.js';
import type {
  PwfReferenceCaseIndex,
  PwfReferenceCaseMetadata,
} from '../domain/pwf.types.js';

describe('PwfStorageService', () => {
  let tempDir: string;
  let service: PwfStorageService;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pwf-storage-test-'));
    process.env.PWF_STORAGE_ROOT = tempDir;
    service = new PwfStorageService();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    delete process.env.PWF_STORAGE_ROOT;
  });

  const sampleMetadata: PwfReferenceCaseMetadata = {
    id: '12345678-1234-1234-1234-123456789abc',
    name: 'caso_teste.pwf',
    sizeBytes: 1024,
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    uploadedAt: new Date().toISOString(),
    status: 'valid',
    anaredeVersion: '12.03.04',
    compatibility: 'supported',
    encoding: 'latin1',
    lineEnding: 'CRLF',
    busCount: 10,
    generatorBusCount: 2,
    generatorGroupCount: 2,
    blocks: ['TITU', 'DBAR'],
    warnings: [],
  };

  const sampleIndex: PwfReferenceCaseIndex = {
    buses: [],
    generatorGroups: [],
  };

  it('saves and retrieves reference case in local storage when supabase is not configured', async () => {
    const originalBuffer = Buffer.from('conteudo teste pwf', 'latin1');

    await service.saveReferenceCase(sampleMetadata, originalBuffer, sampleIndex);

    const metadata = await service.getMetadata(sampleMetadata.id);
    expect(metadata.id).toBe(sampleMetadata.id);
    expect(metadata.name).toBe('caso_teste.pwf');

    const index = await service.getIndex(sampleMetadata.id);
    expect(index.buses).toEqual([]);

    const original = await service.getOriginalPwf(sampleMetadata.id);
    expect(original.toString('latin1')).toBe('conteudo teste pwf');
  });

  it('throws NotFoundException for unknown id', async () => {
    await expect(
      service.getMetadata('87654321-4321-4321-4321-cba987654321'),
    ).rejects.toThrow('não encontrado');
  });
});
