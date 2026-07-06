import type { SuppressionSummary } from '@tft/shared';
import type { SuppressionRow } from '../database/rows';

export function toSuppressionSummary(row: SuppressionRow): SuppressionSummary {
  return {
    id: row.id,
    email: row.email,
    customerId: row.customer_id,
    reason: row.reason,
    sourceMessageId: row.source_message_id,
    suppressedAt: row.suppressed_at.toISOString(),
    releasedAt: row.released_at?.toISOString() ?? null,
    releasedBy: row.released_by,
    createdAt: row.created_at.toISOString(),
  };
}
