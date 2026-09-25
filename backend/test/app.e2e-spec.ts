import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureBodyParsers } from './../src/http-body-parser.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('AppController (e2e)', () => {
  let app: INestApplication & NestExpressApplication;
  let storageRoot: string;

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'climagrid-pwf-e2e-'));
    process.env.PWF_STORAGE_ROOT = storageRoot;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureBodyParsers(app);
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('reports available capabilities without claiming an unavailable AI service', async () => {
    const response = await request(app.getHttpServer())
      .get('/system/capabilities')
      .expect(200);
    expect(response.body.backend.available).toBe(true);
    expect(response.body.pwf.export).toBe(true);
    expect(typeof response.body.climate.fileUpload).toBe('boolean');
  });

  it('uploads, interprets and exposes generation targets from a PWF', async () => {
    const sourcePwf = createMinimalPwf();
    const upload = await request(app.getHttpServer())
      .post('/pwf/reference-cases')
      .attach('file', sourcePwf, 'caso-2029.pwf')
      .expect(201);

    expect(upload.body).toMatchObject({
      status: 'valid',
      anaredeVersion: '12.03.04',
      compatibility: 'supported',
      studyYear: 2029,
      busCount: 1,
      generatorBusCount: 1,
      generatorGroupCount: 1,
    });
    expect(upload.body.blocks).toEqual(
      expect.arrayContaining(['DBAR', 'DGER', 'DGEI']),
    );
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

    const exported = await request(app.getHttpServer())
      .post('/pwf/exports')
      .send({
        referencePwfId: upload.body.id,
        scenarioId: 'cenario-teste',
        // O replay completo pode conter centenas de alocações e ultrapassar
        // o limite padrão de 100 KB do parser JSON do Express.
        studyName: `Teste integrado ${'x'.repeat(110_000)}`,
        generationSource: 'observed',
        dataVersion: 'snapshot-teste',
        plants: [
          {
            plantId: 'usina-1',
            onsId: 'ONS_1',
            generationMw: 87.5,
            mapping: {
              busNumber: '123',
              busName: 'PARQUE EOL',
              nominalVoltageKv: '230',
              area: '5',
            },
          },
        ],
      })
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(201);

    expect(exported.headers['x-generation-source']).toBe('observed');
    expect(exported.headers['x-modified-buses']).toBe('123');
    const exportedBuffer = exported.body as Buffer;
    expect(exportedBuffer.toString('latin1')).toContain(' 87.5');
    expect(exportedBuffer.length).toBe(sourcePwf.length);
    expect(block(exportedBuffer, 'DGER')).toBe(block(sourcePwf, 'DGER'));
    expect(block(exportedBuffer, 'DGEI')).toBe(block(sourcePwf, 'DGEI'));

    const scenarioExport = await request(app.getHttpServer())
      .post('/pwf/exports')
      .send({
        referencePwfId: upload.body.id,
        scenarioId: 'cenario-climatico-teste',
        studyName: 'Potencial pelo vento',
        generationSource: 'estimated',
        dataVersion: 'user-csv-sha256-teste',
        plants: [{
          plantId: 'ONS_1', onsId: 'ONS_1', generationMw: 7.11,
          mapping: { busNumber: '123', busName: 'PARQUE EOL',
            nominalVoltageKv: '230', area: '5' },
        }],
      })
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (data: Buffer) => chunks.push(data));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(201);
    expect(scenarioExport.headers['x-generation-source']).toBe('estimated');
    expect(scenarioExport.headers['x-data-version']).toBe('user-csv-sha256-teste');
    const scenarioPwf = scenarioExport.body as Buffer;
    expect(scenarioPwf.toString('latin1')).toContain('  7.1');
    expect(scenarioPwf.length).toBe(sourcePwf.length);
    expect(block(scenarioPwf, 'DGER')).toBe(block(sourcePwf, 'DGER'));
    expect(block(scenarioPwf, 'DGEI')).toBe(block(sourcePwf, 'DGEI'));
  });

  it('exports an estimated scenario into a real 2040 PWF', async () => {
    const original = await readFile(join(
      process.cwd(), '..', 'Docs', 'Casos de Referência', 'pwfs',
      '2040_1. PD 2035 - MÁXIMA DIURNA SECO.PWF',
    ));
    const upload = await request(app.getHttpServer())
      .post('/pwf/reference-cases')
      .attach('file', original, 'referencia-2040.pwf')
      .expect(201);
    const targets = await request(app.getHttpServer())
      .get(`/pwf/reference-cases/${upload.body.id}/generation-targets`)
      .expect(200);
    const target = targets.body.items.find((item: { editable: boolean }) => item.editable);
    expect(target).toBeDefined();

    const exported = await request(app.getHttpServer())
      .post('/pwf/exports')
      .send({
        referencePwfId: upload.body.id,
        scenarioId: 'cenario-climatico-real',
        studyName: 'Potencial físico',
        generationSource: 'estimated',
        dataVersion: 'user-csv-sha256-teste-real',
        plants: [{
          plantId: 'CEECVA', onsId: 'CEECVA', generationMw: 7.110642,
          mapping: {
            busNumber: String(target.busNumber), busName: target.busName,
            nominalVoltageKv: String(target.baseVoltageKv ?? ''),
            area: String(target.area ?? ''),
          },
        }],
      })
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (data: Buffer) => chunks.push(data));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(201);
    const result = exported.body as Buffer;
    expect(result.length).toBe(original.length);
    expect(exported.headers['x-generation-source']).toBe('estimated');
    expect(exported.headers['x-modified-buses']).toBe(String(target.busNumber));
    expect(block(result, 'DGER')).toBe(block(original, 'DGER'));
    expect(block(result, 'DGEI')).toBe(block(original, 'DGEI'));
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
  const dger = Array<string>(27).fill(' ');
  put(dger, 0, 5, '123', true);
  put(dger, 8, 14, '10.0', true);
  put(dger, 15, 21, '180.0', true);
  const dgei = Array<string>(91).fill(' ');
  put(dgei, 0, 5, '123', true);
  put(dgei, 7, 8, 'N');
  put(dgei, 9, 11, '1', true);
  put(dgei, 12, 13, 'L');
  put(dgei, 13, 16, '4', true);
  put(dgei, 16, 19, '3', true);
  put(dgei, 19, 22, '1', true);
  put(dgei, 22, 27, '25.0', true);
  put(dgei, 69, 74, '55.0', true);
  put(dgei, 74, 80, '50.0', true);

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
      'DGER',
      dger.join(''),
      '99999',
      'DGEI',
      dgei.join(''),
      '99999',
      'FIM',
      '',
    ].join('\r\n'),
    'latin1',
  );
}

function block(buffer: Buffer, code: string): string {
  const text = buffer.toString('latin1');
  const start = text.indexOf(`${code}\r\n`);
  const end = text.indexOf('99999', start);
  return text.slice(start, end + 5);
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
