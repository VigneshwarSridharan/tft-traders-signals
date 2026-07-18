import type { ApiKeyScope, ApiKeySummary } from '@tft/shared';
import type { ApiKeyRow, UserRow } from '../database/rows';

/** Never include `key_hash` on any outbound DTO. */
export function toApiKeySummary(
  row: ApiKeyRow,
  user?: UserRow | null,
): ApiKeySummary {
  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes as ApiKeyScope[],
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    userId: row.user_id,
    userName: user?.name,
  };
}
