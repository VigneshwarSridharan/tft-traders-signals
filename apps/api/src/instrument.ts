// Loaded before any other module (see main.ts / worker.ts) so Sentry's
// auto-instrumentation can patch libraries before they're required. This
// runs ahead of Nest's ConfigModule, so env vars aren't validated/typed yet —
// load .env by hand here for local dev; in Docker, env_file already puts
// these in process.env before the process starts, and dotenv never
// overwrites a variable that's already set.
import { config as loadEnv } from 'dotenv';
loadEnv();

import * as Sentry from '@sentry/nestjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
}
