import type { InvitationSummary, UserSummary } from '@tft/shared';
import type { InvitationRow, UserRow } from '../database/rows';

export function toUserSummary(row: UserRow): UserSummary {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export function toInvitationSummary(row: InvitationRow): InvitationSummary {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    invitedBy: row.invited_by,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}
