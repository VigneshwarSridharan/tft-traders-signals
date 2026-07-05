import { Controller, Get } from '@nestjs/common';
import type { HealthCheckResponse } from '@tft/shared';

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthCheckResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
