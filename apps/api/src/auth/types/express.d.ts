import type { AccessTokenPayload } from '../jwt-payload.interface';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
      /** Set by ApiKeyAuthGuard when the request is authenticated via a public API key. */
      apiKeyScopes?: string[];
      apiKeyId?: string;
    }
  }
}

export {};
