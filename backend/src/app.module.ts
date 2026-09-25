import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PwfModule } from './modules/pwf/pwf.module.js';
import { SupabaseModule } from './modules/supabase/supabase.module.js';
import { IntegrationModule } from './modules/integration/integration.module.js';
import { ClimateScenarioModule } from './modules/climate-scenario/climate-scenario.module.js';

@Module({
  imports: [SupabaseModule, ClimateScenarioModule, PwfModule, IntegrationModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
