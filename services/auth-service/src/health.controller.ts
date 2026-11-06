import { Controller, Get } from '@nestjs/common';
import { Public }          from './auth/decorators/index';
@Controller('health')
export class HealthController {
  @Get()
  @Public() 
  check() { return { status: 'ok' }; }
}
