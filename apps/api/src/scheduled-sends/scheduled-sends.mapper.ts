import type { ScheduledSendListItem } from '@tft/shared';
import type { ScheduledSendListRow } from '../database/scheduled-sends.repository';

export function toScheduledSendListItem(
  row: ScheduledSendListRow,
): ScheduledSendListItem {
  return {
    messageId: row.message_id,
    toEmail: row.to_email,
    toName: row.to_name,
    subject: row.subject,
    senderAccountId: row.sender_account_id,
    senderAccountEmail: row.sender_account_email,
    senderAccountDisplayName: row.sender_account_display_name,
    scheduledFor: row.scheduled_for.toISOString(),
    timezone: row.timezone,
    createdAt: row.created_at.toISOString(),
  };
}
