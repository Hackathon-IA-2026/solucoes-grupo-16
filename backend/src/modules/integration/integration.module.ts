import { Module } from '@nestjs/common';
import { AiServiceClient } from './ai-service.client.js';
import { IntegrationController } from './integration.controller.js';

@Module({
  controllers: [IntegrationController],
  providers: [AiServiceClient],
})
export class IntegrationModule {}
