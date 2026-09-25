import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureBodyParsers } from './http-body-parser.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  configureBodyParsers(app);

  // ── CORS ──────────────────────────────────────────────────────────────
  // Permite requisições do frontend. Múltiplas origens podem ser separadas
  // por vírgula na variável FRONTEND_ORIGIN (ex: "http://localhost:3000,https://app.example.com").
  const allowedOrigins = (
    process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim());

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    exposedHeaders: [
      'X-Filename',
      'X-Generated-At',
      'X-Model-Version',
      'X-Data-Version',
      'X-Generation-Source',
      'X-Modified-Buses',
    ],
    credentials: true,
  });

  // ── Swagger ───────────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ClimaGrid API')
    .setDescription(
      `API do ClimaGrid para gerenciamento de casos de referência PWF.\n\n` +
        `### CORS\n` +
        `Origens permitidas: \`${allowedOrigins.join('`, `')}\`\n\n` +
        `Métodos: \`GET\`, \`POST\`, \`PUT\`, \`PATCH\`, \`DELETE\`, \`OPTIONS\`\n\n` +
        `Headers permitidos: \`Content-Type\`, \`Authorization\`, \`Accept\`\n\n` +
        `Credenciais: habilitadas`,
    )
    .setVersion('1.0')
    .addTag('PWF Reference Cases', 'Upload e consulta de casos de referência PWF')
    .addTag('App', 'Health check e endpoints gerais')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3333);
}
await bootstrap();
