import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PwfModule } from './modules/pwf/pwf.module.js';

@Module({
  imports: [PwfModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
