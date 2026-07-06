import type { AccessTokenPayload } from '../jwt-payload.interface';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export {};
