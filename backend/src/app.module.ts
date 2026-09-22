import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PwfModule } from './modules/pwf/pwf.module.js';
import { SupabaseModule } from './modules/supabase/supabase.module.js';

@Module({
  imports: [SupabaseModule, PwfModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
