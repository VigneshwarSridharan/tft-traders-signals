import { createServer, type Server } from 'node:http';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.validation';
import { ReadinessService } from './readiness.service';

/**
 * The worker process (worker.ts) is a Nest application *context*, not an
 * HTTP server — it has no port for `docker healthcheck` to hit. This gives
 * it one, reusing the same DB/Redis checks as the api's `/health/ready`.
 */
export function startWorkerHealthServer(app: INestApplicationContext): Server {
  const configService = app.get(ConfigService<EnvConfig, true>);
  const readinessService = app.get(ReadinessService);
  const port = configService.get('WORKER_HEALTH_PORT', { infer: true });

  const server = createServer((req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }
    void readinessService.check().then((result) => {
      res.writeHead(result.status === 'ok' ? 200 : 503, {
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify(result));
    });
  });

  server.listen(port);
  return server;
}
