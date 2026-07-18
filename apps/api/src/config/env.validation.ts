import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  TRACKING_DOMAIN: z.string().min(1, 'TRACKING_DOMAIN is required'),
  APP_ENCRYPTION_KEY: z
    .string()
    .min(32, 'APP_ENCRYPTION_KEY must be at least 32 characters'),
  WEB_APP_URL: z.string().min(1, 'WEB_APP_URL is required'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().min(1).default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  INVITATION_TTL_HOURS: z.coerce.number().int().positive().default(72),
  ATTACHMENT_STORAGE_PATH: z.string().min(1).default('./storage/attachments'),
  SEND_FROM_DOMAIN: z.string().min(1).default('tft-traders-signals.local'),
  GEOLITE2_CITY_DB_PATH: z.string().min(1).optional(),
  TRACKING_CLICK_BOT_MIN_SECONDS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(3),
  TRACKING_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  TRACKING_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60_000),
  INBOUND_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(120_000),
  DELIVERY_HEURISTIC_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60_000),
  DELIVERY_HEURISTIC_HOURS: z.coerce.number().int().positive().default(48),
  SOFT_BOUNCE_SUPPRESSION_THRESHOLD: z.coerce
    .number()
    .int()
    .positive()
    .default(3),
  SOFT_BOUNCE_SUPPRESSION_WINDOW_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
  STATS_ROLLUP_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(300_000),
  ENGAGEMENT_ROLLUP_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(300_000),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}
