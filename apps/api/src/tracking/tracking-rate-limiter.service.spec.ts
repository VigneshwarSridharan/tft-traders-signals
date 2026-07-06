import { ConfigService } from '@nestjs/config';
import { TrackingRateLimiterService } from './tracking-rate-limiter.service';
import type { EnvConfig } from '../config/env.validation';

function buildConfigService(
  overrides: Partial<{ max: number; windowMs: number }> = {},
): ConfigService<EnvConfig, true> {
  const max = overrides.max ?? 3;
  const windowMs = overrides.windowMs ?? 60_000;
  return {
    get: jest.fn((key: string) => {
      if (key === 'TRACKING_RATE_LIMIT_MAX') return max;
      if (key === 'TRACKING_RATE_LIMIT_WINDOW_MS') return windowMs;
      return undefined;
    }),
  } as unknown as ConfigService<EnvConfig, true>;
}

describe('TrackingRateLimiterService', () => {
  it('allows requests up to the configured max per IP', () => {
    const service = new TrackingRateLimiterService(
      buildConfigService({ max: 2 }),
    );

    expect(service.consume('1.2.3.4')).toBe(true);
    expect(service.consume('1.2.3.4')).toBe(true);
    expect(service.consume('1.2.3.4')).toBe(false);
  });

  it('tracks each IP independently', () => {
    const service = new TrackingRateLimiterService(
      buildConfigService({ max: 1 }),
    );

    expect(service.consume('1.2.3.4')).toBe(true);
    expect(service.consume('1.2.3.4')).toBe(false);
    expect(service.consume('5.6.7.8')).toBe(true);
  });

  it('resets the allowance once the window elapses', () => {
    jest.useFakeTimers();
    const service = new TrackingRateLimiterService(
      buildConfigService({ max: 1, windowMs: 1000 }),
    );

    expect(service.consume('1.2.3.4')).toBe(true);
    expect(service.consume('1.2.3.4')).toBe(false);

    jest.advanceTimersByTime(1001);

    expect(service.consume('1.2.3.4')).toBe(true);
    jest.useRealTimers();
  });
});
