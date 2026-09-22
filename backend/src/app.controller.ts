import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'Health check',
    description: 'Retorna uma mensagem indicando que a API está funcionando.',
  })
  @ApiResponse({ status: 200, description: 'API funcionando.', type: String })
  getHello(): string {
    return this.appService.getHello();
  }
}

