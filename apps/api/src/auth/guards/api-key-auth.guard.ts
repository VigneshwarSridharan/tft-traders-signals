import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { hashApiKeySecret } from '../../common/crypto.util';
import { ApiKeysRepository } from '../../database/api-keys.repository';
import { UsersRepository } from '../../database/users.repository';
import type { AccessTokenPayload } from '../jwt-payload.interface';

function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return undefined;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * Authenticates public API (`/v1/*`) requests via `Authorization: Bearer
 * <key>` instead of the dashboard's cookie-based JWT. On success it
 * populates `request.user` the same shape as JwtAuthGuard (so downstream
 * services/RolesGuard work unmodified), plus `request.apiKeyScopes` /
 * `request.apiKeyId` for ScopesGuard and rate limiting.
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly apiKeysRepository: ApiKeysRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Not authenticated');
    }

    const keyHash = hashApiKeySecret(token);
    const apiKey = await this.apiKeysRepository.findByHash(keyHash);
    const now = Date.now();
    if (
      !apiKey ||
      apiKey.revoked_at !== null ||
      (apiKey.expires_at !== null && apiKey.expires_at.getTime() <= now)
    ) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    const user = await this.usersRepository.findById(apiKey.user_id);
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    request.user = payload;
    request.apiKeyScopes = apiKey.scopes;
    request.apiKeyId = apiKey.id;

    // Fire-and-forget: a failure here must never block the request it's
    // just bookkeeping for "last used" display in the dashboard.
    void this.apiKeysRepository.touchLastUsed(apiKey.id);

    return true;
  }
}
