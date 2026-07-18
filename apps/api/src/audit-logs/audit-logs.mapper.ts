import type { AuditLogSummary } from '@tft/shared';
import type { AuditLogRow, UserRow } from '../database/rows';

export function toAuditLogSummary(
  row: AuditLogRow,
  userById: Map<string, UserRow>,
): AuditLogSummary {
  const user = row.user_id ? (userById.get(row.user_id) ?? null) : null;
  return {
    id: row.id,
    userId: row.user_id,
    userName: user?.name ?? null,
    userEmail: user?.email ?? null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
  };
}
