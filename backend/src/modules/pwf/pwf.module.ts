import { Module } from '@nestjs/common';
import { PwfReferenceCaseController } from './api/pwf-reference-case.controller.js';
import { PwfReferenceCaseService } from './application/pwf-reference-case.service.js';
import { PwfParserService } from './parser/pwf-parser.service.js';
import { PwfStorageService } from './storage/pwf-storage.service.js';

@Module({
  controllers: [PwfReferenceCaseController],
  providers: [PwfReferenceCaseService, PwfParserService, PwfStorageService],
  exports: [PwfReferenceCaseService, PwfParserService],
})
export class PwfModule {}
