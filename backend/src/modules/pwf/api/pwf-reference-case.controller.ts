import {
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  PwfReferenceCaseService,
  type UploadedPwfFile,
} from '../application/pwf-reference-case.service.js';
import { PwfReferenceCaseMetadataDto } from './dto/pwf-reference-case-metadata.dto.js';
import { PwfGenerationTargetsResponseDto } from './dto/pwf-generation-targets.dto.js';

const MAX_PWF_SIZE_BYTES = 25 * 1024 * 1024;

@ApiTags('PWF Reference Cases')
@Controller('pwf/reference-cases')
export class PwfReferenceCaseController {
  constructor(private readonly referenceCases: PwfReferenceCaseService) {}

  @Post()
  @ApiOperation({
    summary: 'Upload de arquivo PWF',
    description:
      'Faz o upload de um arquivo PWF (.pwf) para criação de um novo caso de referência. ' +
      'O arquivo é parseado e validado automaticamente. Tamanho máximo: 25 MB.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Arquivo PWF (.pwf) para upload',
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Arquivo PWF (.pwf) — máximo 25 MB',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Arquivo processado com sucesso. Retorna os metadados do caso de referência.',
    type: PwfReferenceCaseMetadataDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Requisição inválida — arquivo ausente ou extensão incorreta.',
  })
  @ApiResponse({
    status: 422,
    description: 'Arquivo PWF com formato inválido ou não processável.',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { files: 1, fileSize: MAX_PWF_SIZE_BYTES },
    }),
  )
  upload(@UploadedFile() file?: UploadedPwfFile) {
    return this.referenceCases.upload(file);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar metadados do caso de referência',
    description: 'Retorna os metadados completos de um caso de referência previamente enviado.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do caso de referência',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Metadados do caso de referência.',
    type: PwfReferenceCaseMetadataDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Caso de referência não encontrado.',
  })
  getMetadata(@Param('id') id: string) {
    return this.referenceCases.getMetadata(id);
  }

  @Get(':id/generation-targets')
  @ApiOperation({
    summary: 'Listar alvos de geração',
    description:
      'Retorna as barras com geração do caso de referência, incluindo seus grupos geradores. ' +
      'Barras dos tipos PV (1) e Swing (2), ou com geração ativa, são incluídas.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID do caso de referência',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de alvos de geração do caso de referência.',
    type: PwfGenerationTargetsResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Caso de referência não encontrado.',
  })
  getGenerationTargets(@Param('id') id: string) {
    return this.referenceCases.getGenerationTargets(id);
  }
}

