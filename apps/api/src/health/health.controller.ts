import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { HealthCheckResponse, ReadinessCheckResponse } from '@tft/shared';
import { ReadinessService } from './readiness.service';

@Controller('health')
export class HealthController {
  constructor(private readonly readinessService: ReadinessService) {}

  @Get()
  check(): HealthCheckResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  // Deep dependency check (DB + Redis) — used by uptime monitors and load
  // balancers deciding whether to route traffic here, not by the fast
  // container-level liveness probe above. Responds 503 when a dependency is
  // down so standard HTTP health-check tooling treats it as unhealthy.
  @Get('ready')
  async ready(): Promise<ReadinessCheckResponse> {
    const result = await this.readinessService.check();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
