import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PwfReferenceCaseMetadataDto {
  @ApiProperty({ description: 'Identificador único do caso de referência (UUID)', example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ description: 'Nome original do arquivo PWF', example: 'caso_base_2025.pwf' })
  name: string;

  @ApiProperty({ description: 'Tamanho do arquivo em bytes', example: 1048576 })
  sizeBytes: number;

  @ApiProperty({ description: 'Hash SHA-256 do arquivo', example: 'a1b2c3d4e5f6...' })
  sha256: string;

  @ApiProperty({ description: 'Data/hora do upload em formato ISO 8601', example: '2025-01-15T10:30:00.000Z' })
  uploadedAt: string;

  @ApiProperty({ description: 'Status do caso de referência', enum: ['valid'], example: 'valid' })
  status: 'valid';

  @ApiProperty({ description: 'Versão do ANAREDE detectada no arquivo', example: 'V12' })
  anaredeVersion: string;

  @ApiProperty({ description: 'Nível de compatibilidade', enum: ['supported', 'unverified'], example: 'supported' })
  compatibility: string;

  @ApiProperty({ description: 'Codificação do arquivo', enum: ['latin1'], example: 'latin1' })
  encoding: 'latin1';

  @ApiProperty({ description: 'Tipo de quebra de linha', enum: ['CRLF', 'LF', 'MIXED', 'NONE'], example: 'CRLF' })
  lineEnding: string;

  @ApiPropertyOptional({ description: 'Título do estudo extraído do arquivo', example: 'Caso Base Verão 2025' })
  title?: string;

  @ApiPropertyOptional({ description: 'Ano do estudo', example: 2025 })
  studyYear?: number;

  @ApiProperty({ description: 'Quantidade total de barras no arquivo', example: 5000 })
  busCount: number;

  @ApiProperty({ description: 'Quantidade de barras com geração', example: 350 })
  generatorBusCount: number;

  @ApiProperty({ description: 'Quantidade de grupos geradores', example: 420 })
  generatorGroupCount: number;

  @ApiProperty({ description: 'Lista dos blocos de dados encontrados no arquivo', type: [String], example: ['DBAR', 'DLIN', 'DGBT'] })
  blocks: string[];

  @ApiProperty({ description: 'Avisos gerados durante o parsing', type: [String] })
  warnings: string[];
}
