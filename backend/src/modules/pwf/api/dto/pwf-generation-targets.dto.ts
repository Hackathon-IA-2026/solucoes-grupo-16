import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PwfGenerationTargetGroupDto {
  @ApiProperty({ description: 'Número da barra do grupo gerador', example: 100 })
  busNumber: number;

  @ApiProperty({ description: 'Número do grupo gerador', example: 1 })
  groupNumber: number;

  @ApiProperty({ description: 'Modo automático ativado', example: true })
  automaticMode: boolean;

  @ApiProperty({ description: 'Status do grupo gerador', enum: ['on', 'off'], example: 'on' })
  status: 'on' | 'off';

  @ApiProperty({ description: 'Número total de unidades no grupo', example: 3 })
  units: number;

  @ApiProperty({ description: 'Unidades online', example: 2 })
  unitsOnline: number;

  @ApiProperty({ description: 'Geração ativa por unidade em MW', example: 150.5 })
  activeGenerationPerUnitMw: number;

  @ApiPropertyOptional({ description: 'Limite mecânico por unidade em MW', example: 200.0 })
  mechanicalLimitPerUnitMw?: number;

  @ApiPropertyOptional({ description: 'Mínimo de geração ativa por unidade em MW', example: 50.0 })
  activeMinimumPerUnitMw?: number;
}

export class PwfGenerationTargetDto {
  @ApiProperty({ description: 'Tipo do alvo de geração', enum: ['bus'], example: 'bus' })
  kind: 'bus';

  @ApiProperty({ description: 'Número da barra', example: 100 })
  busNumber: number;

  @ApiProperty({ description: 'Nome da barra', example: 'ITAIPU-GR1' })
  busName: string;

  @ApiProperty({ description: 'Tipo da barra (0=PQ, 1=PV, 2=Swing, 3=PQ com limite)', enum: [0, 1, 2, 3], example: 1 })
  busType: 0 | 1 | 2 | 3;

  @ApiPropertyOptional({ description: 'Área elétrica', example: 1 })
  area?: number;

  @ApiPropertyOptional({ description: 'Tensão base em kV', example: 765.0 })
  baseVoltageKv?: number;

  @ApiProperty({ description: 'Geração ativa em MW', example: 700.0 })
  activeGenerationMw: number;

  @ApiPropertyOptional({ description: 'Geração ativa mínima em MW', example: 200.0 })
  activeGenerationMinimumMw?: number;

  @ApiPropertyOptional({ description: 'Geração ativa máxima em MW', example: 1400.0 })
  activeGenerationMaximumMw?: number;

  @ApiProperty({ description: 'Indica se o alvo é editável', example: true })
  editable: boolean;

  @ApiProperty({ description: 'Grupos geradores associados a esta barra', type: [PwfGenerationTargetGroupDto] })
  generatorGroups: PwfGenerationTargetGroupDto[];
}

export class PwfGenerationTargetsResponseDto {
  @ApiProperty({ description: 'Lista de alvos de geração', type: [PwfGenerationTargetDto] })
  items: PwfGenerationTargetDto[];
}
