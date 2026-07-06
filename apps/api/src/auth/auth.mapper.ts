import type { AuthUser } from '@tft/shared';
import type { UserRow } from '../database/rows';

export function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    theme: row.theme,
  };
}
