import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClimateScenarioStorageService } from './climate-scenario-storage.service.js';

@ApiTags('Climate Scenarios')
@Controller('climate-scenarios')
export class ClimateScenarioController {
  constructor(private readonly scenarios: ClimateScenarioStorageService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Consultar o manifesto e as exportações de um cenário climático' })
  getTrace(@Param('id') id: string) {
    return this.scenarios.getTrace(id);
  }
}
