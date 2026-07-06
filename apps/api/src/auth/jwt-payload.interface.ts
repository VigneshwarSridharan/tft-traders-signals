import type { UserRole } from '@tft/shared';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}
