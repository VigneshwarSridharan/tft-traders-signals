import type { AttachmentSummary, EmailMessageSummary } from '@tft/shared';
import type { AttachmentRow, EmailMessageRow } from '../database/rows';

export function toAttachmentSummary(row: AttachmentRow): AttachmentSummary {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes ?? 0,
  };
}

export function toEmailMessageSummary(
  row: EmailMessageRow,
  attachments: AttachmentRow[],
): EmailMessageSummary {
  return {
    id: row.id,
    publicToken: row.public_token,
    senderAccountId: row.sender_account_id,
    customerId: row.customer_id,
    templateVersionId: row.template_version_id,
    toEmail: row.to_email,
    toName: row.to_name,
    subject: row.subject,
    status: row.status,
    trackingEnabled: row.tracking_enabled,
    smtpResponse: row.smtp_response,
    queuedAt: row.queued_at?.toISOString() ?? null,
    sentAt: row.sent_at?.toISOString() ?? null,
    attachments: attachments.map(toAttachmentSummary),
    createdAt: row.created_at.toISOString(),
  };
}
