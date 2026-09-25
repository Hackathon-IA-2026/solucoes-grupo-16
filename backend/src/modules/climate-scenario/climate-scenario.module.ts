import { Global, Module } from '@nestjs/common';
import { ClimateScenarioController } from './climate-scenario.controller.js';
import { ClimateScenarioStorageService } from './climate-scenario-storage.service.js';

@Global()
@Module({
  controllers: [ClimateScenarioController],
  providers: [ClimateScenarioStorageService],
  exports: [ClimateScenarioStorageService],
})
export class ClimateScenarioModule {}
