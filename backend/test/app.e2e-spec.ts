import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let storageRoot: string;

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'climagrid-pwf-e2e-'));
    process.env.PWF_STORAGE_ROOT = storageRoot;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('uploads, interprets and exposes generation targets from a PWF', async () => {
    const upload = await request(app.getHttpServer())
      .post('/pwf/reference-cases')
      .attach('file', createMinimalPwf(), 'caso-2029.pwf')
      .expect(201);

    expect(upload.body).toMatchObject({
      status: 'valid',
      anaredeVersion: '12.03.04',
      compatibility: 'supported',
      studyYear: 2029,
      busCount: 1,
      generatorBusCount: 1,
    });
    expect(upload.body.sha256).toMatch(/^[0-9a-f]{64}$/);

    const targets = await request(app.getHttpServer())
      .get(`/pwf/reference-cases/${upload.body.id}/generation-targets`)
      .expect(200);

    expect(targets.body.items).toHaveLength(1);
    expect(targets.body.items[0]).toMatchObject({
      busNumber: 123,
      busName: 'PARQUE EOL',
      activeGenerationMw: 100,
      editable: true,
    });
  });

  afterAll(async () => {
    await app.close();
    await rm(storageRoot, { recursive: true, force: true });
    delete process.env.PWF_STORAGE_ROOT;
  });
});

function createMinimalPwf(): Buffer {
  const record = Array<string>(111).fill(' ');
  put(record, 0, 5, '123', true);
  put(record, 6, 7, 'L');
  put(record, 7, 8, '1');
  put(record, 8, 10, '1', true);
  put(record, 10, 22, 'PARQUE EOL');
  put(record, 32, 37, '100.0', true);
  put(record, 73, 76, '5', true);

  return Buffer.from(
    [
      '( Versao do Anarede: 12.03.04',
      'TITU',
      '** CASO TESTE ** ANO 2029',
      'DGBT',
      ' 1  230.',
      '99999',
      'DBAR',
      record.join(''),
      '99999',
      'FIM',
      '',
    ].join('\r\n'),
    'latin1',
  );
}

function put(
  target: string[],
  start: number,
  end: number,
  value: string,
  right = false,
): void {
  const width = end - start;
  const formatted = right ? value.padStart(width) : value.padEnd(width);
  target.splice(start, width, ...formatted.slice(0, width));
}
