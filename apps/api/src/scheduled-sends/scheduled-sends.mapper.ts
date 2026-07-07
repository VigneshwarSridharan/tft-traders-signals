import type { ScheduledSendListItem } from '@tft/shared';
import type { ScheduledSendListRow } from '../database/scheduled-sends.repository';
import type { SenderAccountRow } from '../database/rows';
import type { TemplateInfo } from '../sent-mail/sent-mail.mapper';

export function toScheduledSendListItem(
  row: ScheduledSendListRow,
  senderAccount: SenderAccountRow | undefined,
  template: TemplateInfo | undefined,
): ScheduledSendListItem {
  return {
    id: row.id,
    messageId: row.message_id,
    toEmail: row.to_email,
    toName: row.to_name,
    subject: row.subject,
    senderAccountId: row.sender_account_id,
    senderAccountEmail: senderAccount?.email ?? '',
    senderAccountDisplayName: senderAccount?.display_name ?? null,
    templateId: template?.templateId ?? null,
    templateName: template?.templateName ?? null,
    scheduledFor: row.scheduled_for.toISOString(),
    timezone: row.timezone,
    createdAt: row.created_at.toISOString(),
  };
}
