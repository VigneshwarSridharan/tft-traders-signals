import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyRateLimiterService } from './api-key-rate-limiter.service';

/**
 * Enforces the per-API-key request budget (PUBLIC_API_RATE_LIMIT_MAX /
 * _WINDOW_MS) on the public REST API. Must run after ApiKeyAuthGuard, which
 * populates `request.apiKeyId`.
 */
@Injectable()
export class ApiKeyRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimiterService: ApiKeyRateLimiterService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKeyId = request.apiKeyId;
    if (!apiKeyId) {
      // No API key on the request (shouldn't happen once ApiKeyAuthGuard has
      // run) — nothing to rate limit against, let it through.
      return true;
    }

    if (!this.rateLimiterService.consume(apiKeyId)) {
      throw new HttpException(
        'Rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
