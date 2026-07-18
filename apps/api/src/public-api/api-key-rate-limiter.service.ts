import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.validation';

interface Bucket {
  count: number;
  resetAt: number;
}

// Fixed-window per-API-key counter for the public REST API (/v1/*).
// In-memory and single-instance only — fine for the current one-api-container
// deployment; a shared store (Redis) would be needed if the api ever scales
// horizontally. Mirrors TrackingRateLimiterService's per-IP design.
@Injectable()
export class ApiKeyRateLimiterService {
  private readonly buckets = new Map<string, Bucket>();
  private callsSinceSweep = 0;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  /** Returns true if this API key is still within its allowance for the current window. */
  consume(apiKeyId: string): boolean {
    const now = Date.now();
    this.maybeSweep(now);

    const max = this.configService.get('PUBLIC_API_RATE_LIMIT_MAX', {
      infer: true,
    });
    const windowMs = this.configService.get('PUBLIC_API_RATE_LIMIT_WINDOW_MS', {
      infer: true,
    });

    const bucket = this.buckets.get(apiKeyId);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(apiKeyId, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (bucket.count >= max) {
      return false;
    }
    bucket.count += 1;
    return true;
  }

  private maybeSweep(now: number): void {
    this.callsSinceSweep += 1;
    if (this.callsSinceSweep < 1000) {
      return;
    }
    this.callsSinceSweep = 0;
    for (const [apiKeyId, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(apiKeyId);
      }
    }
  }
}
