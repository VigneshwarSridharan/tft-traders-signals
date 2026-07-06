import type { Response } from 'express';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.validation';
import type { TokenPair } from './auth.service';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

export function setAuthCookies(
  res: Response,
  configService: ConfigService<EnvConfig, true>,
  tokens: TokenPair,
): void {
  const secure =
    configService.get('NODE_ENV', { infer: true }) === 'production';

  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  });
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/auth',
    expires: tokens.refreshExpiresAt,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/auth' });
}
