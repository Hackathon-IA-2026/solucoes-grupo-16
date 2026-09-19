import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  PwfReferenceCaseIndex,
  PwfReferenceCaseMetadata,
} from '../domain/pwf.types.js';

@Injectable()
export class PwfStorageService {
  private readonly root = resolve(
    process.env.PWF_STORAGE_ROOT ?? resolve(process.cwd(), 'data', 'pwf'),
  );

  async saveReferenceCase(
    metadata: PwfReferenceCaseMetadata,
    original: Buffer,
    index: PwfReferenceCaseIndex,
  ): Promise<void> {
    const referenceRoot = resolve(this.root, 'reference-cases');
    const caseRoot = resolve(referenceRoot, metadata.id);
    await mkdir(referenceRoot, { recursive: true });
    await mkdir(caseRoot, { recursive: false });

    await Promise.all([
      writeFile(resolve(caseRoot, 'original.pwf'), original, { flag: 'wx' }),
      writeFile(
        resolve(caseRoot, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
        { encoding: 'utf8', flag: 'wx' },
      ),
      writeFile(resolve(caseRoot, 'parsed-index.json'), JSON.stringify(index), {
        encoding: 'utf8',
        flag: 'wx',
      }),
    ]);
  }

  async getMetadata(id: string): Promise<PwfReferenceCaseMetadata> {
    return this.readJson<PwfReferenceCaseMetadata>(id, 'metadata.json');
  }

  async getIndex(id: string): Promise<PwfReferenceCaseIndex> {
    return this.readJson<PwfReferenceCaseIndex>(id, 'parsed-index.json');
  }

  private async readJson<T>(id: string, filename: string): Promise<T> {
    assertReferenceCaseId(id);
    try {
      const content = await readFile(
        resolve(this.root, 'reference-cases', id, filename),
        'utf8',
      );
      return JSON.parse(content) as T;
    } catch {
      throw new NotFoundException(`Caso PWF ${id} não encontrado.`);
    }
  }
}

function assertReferenceCaseId(id: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) {
    throw new NotFoundException(`Caso PWF ${id} não encontrado.`);
  }
}
