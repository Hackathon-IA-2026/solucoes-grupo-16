import {
  Body,
  Controller,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  PwfExportService,
  type PwfExportRequest,
} from '../application/pwf-export.service.js';

@ApiTags('PWF Exports')
@Controller('pwf/exports')
export class PwfExportController {
  constructor(private readonly exports: PwfExportService) {}

  @Post()
  @ApiOperation({
    summary: 'Gerar um PWF com a geração do cenário nas barras mapeadas',
  })
  @ApiResponse({ status: 201, description: 'Arquivo PWF gerado.' })
  async export(
    @Body() payload: PwfExportRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.exports.export(payload);
    response.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'X-Filename': result.filename,
      'X-Generated-At': result.generatedAt,
      'X-Generation-Source': result.generationSource,
      'X-Data-Version': result.dataVersion,
      'X-Modified-Buses': result.modifiedBuses.join(','),
    });
    return new StreamableFile(result.buffer);
  }
}
