import { Module } from '@nestjs/common';
import { PwfReferenceCaseController } from './api/pwf-reference-case.controller.js';
import { PwfReferenceCaseService } from './application/pwf-reference-case.service.js';
import { PwfParserService } from './parser/pwf-parser.service.js';
import { PwfStorageService } from './storage/pwf-storage.service.js';
import { SupabaseModule } from '../supabase/supabase.module.js';
import { PwfExportController } from './api/pwf-export.controller.js';
import { PwfExportService } from './application/pwf-export.service.js';

@Module({
  imports: [SupabaseModule],
  controllers: [PwfReferenceCaseController, PwfExportController],
  providers: [
    PwfReferenceCaseService,
    PwfExportService,
    PwfParserService,
    PwfStorageService,
  ],
  exports: [PwfReferenceCaseService, PwfParserService],
})
export class PwfModule {}
