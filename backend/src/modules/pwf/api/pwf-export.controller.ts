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
      'X-Export-Mode': result.exportMode,
      'X-Modified-Buses': result.modifiedBuses.join(','),
      ...(result.exportId ? { 'X-Export-Id': result.exportId } : {}),
      ...(result.outputSha256
        ? { 'X-Output-SHA256': result.outputSha256 }
        : {}),
      ...(result.referenceSha256
        ? { 'X-Reference-SHA256': result.referenceSha256 }
        : {}),
    });
    return new StreamableFile(result.buffer);
  }
}
