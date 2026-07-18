import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiKeyScope } from '@tft/shared';
import type { Request } from 'express';
import { SCOPES_KEY } from '../decorators/scopes.decorator';

/**
 * Mirrors RolesGuard, but checks the scopes carried by the API key that
 * authenticated the request (set by ApiKeyAuthGuard) rather than the JWT
 * cookie's role. A route with no @RequireScopes() metadata is allowed
 * through regardless of the key's scopes.
 */
@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<
      ApiKeyScope[] | undefined
    >(SCOPES_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const grantedScopes = new Set(request.apiKeyScopes ?? []);
    const hasAllRequired = requiredScopes.every((scope) =>
      grantedScopes.has(scope),
    );
    if (!hasAllRequired) {
      throw new ForbiddenException('Insufficient API key scope');
    }

    return true;
  }
}
