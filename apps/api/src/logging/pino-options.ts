import type { Params } from 'nestjs-pino';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.validation';

// Paths redacted from every log line, regardless of level — credentials and
// session material must never reach log storage (structured or not).
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.appPassword',
  'req.body.app_password',
  'req.body.accessToken',
  'req.body.refreshToken',
  'req.body.token',
];

export function buildPinoOptions(
  configService: ConfigService<EnvConfig, true>,
): Params {
  const nodeEnv = configService.get('NODE_ENV', { infer: true });
  const level = configService.get('LOG_LEVEL', { infer: true });
  const isDevelopment = nodeEnv === 'development';

  return {
    pinoHttp: {
      level,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      // Pretty-print in local dev only; ship raw JSON lines everywhere else
      // (including CI/test) for log aggregators (CloudWatch/Datadog/Loki/etc.)
      // to parse, and to avoid spinning up the pino-pretty worker thread
      // during automated test runs.
      transport: isDevelopment
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
      autoLogging: {
        ignore: (req) => req.url === '/health' || req.url === '/health/ready',
      },
      customProps: () => ({ service: 'api' }),
    },
  };
}
