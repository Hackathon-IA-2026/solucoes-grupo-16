import type { NestExpressApplication } from '@nestjs/platform-express';

const REQUEST_BODY_LIMIT = '2mb';

export function configureBodyParsers(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: REQUEST_BODY_LIMIT });
  app.useBodyParser('urlencoded', {
    limit: REQUEST_BODY_LIMIT,
    extended: true,
  });
}
