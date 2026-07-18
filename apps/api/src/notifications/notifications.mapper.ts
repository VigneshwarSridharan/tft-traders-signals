import type { NotificationSummary } from '@tft/shared';
import type { NotificationRow } from '../database/rows';

export function toNotificationSummary(
  row: NotificationRow,
): NotificationSummary {
  return {
    id: row.id,
    type: row.type,
    messageId: row.message_id,
    title: row.title,
    body: row.body,
    readAt: row.read_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}
