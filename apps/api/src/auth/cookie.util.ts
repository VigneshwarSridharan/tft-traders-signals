import type { Response } from 'express';
import type { TokenPair } from './auth.service';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

export function setAuthCookies(res: Response, tokens: TokenPair): void {
  // Caddy proxies the dashboard's /api/* calls to this service under the
  // dashboard's own origin (see docker/caddy/Caddyfile), so these are
  // ordinary first-party cookies from the browser's perspective — no
  // SameSite=None/cross-site Domain sharing needed.
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    // The browser only ever sees this under Caddy's /api prefix (see
    // docker/caddy/Caddyfile's handle_path, which strips it before
    // forwarding here) — Path is matched against the browser-visible URL,
    // not this service's own route, so it has to include that prefix.
    path: '/api/auth',
    expires: tokens.refreshExpiresAt,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/auth' });
}
