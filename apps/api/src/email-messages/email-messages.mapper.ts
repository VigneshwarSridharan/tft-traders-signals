import type {
  AttachmentSummary,
  EmailLinkClickSummary,
  EmailMessageDetail,
  EmailMessageListItem,
  EmailMessageSummary,
  SavedMessageFilter,
  TrackingEventSummary,
} from '@tft/shared';
import type {
  AttachmentRow,
  BounceRow,
  EmailLinkRow,
  EmailMessageRow,
  SavedMessageFilterRow,
  TagRow,
} from '../database/rows';
import type { EmailMessageListRow } from '../database/email-messages.repository';
import type { TrackingEventWithLinkRow } from '../database/tracking-events.repository';

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

export function toEmailMessageListItem(
  row: EmailMessageListRow,
  tags: TagRow[],
): EmailMessageListItem {
  return {
    id: row.id,
    toName: row.to_name,
    toEmail: row.to_email,
    senderAccountId: row.sender_account_id,
    senderAccountEmail: row.sender_account_email,
    senderAccountDisplayName: row.sender_account_display_name,
    templateId: row.template_id,
    templateName: row.template_name,
    subject: row.subject,
    status: row.status,
    sentAt: row.sent_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    openCount: row.open_count,
    clickCount: row.click_count,
    repliedAt: row.replied_at?.toISOString() ?? null,
    tags: tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
  };
}

export function toEmailMessageDetail(
  row: EmailMessageListRow,
  attachments: AttachmentRow[],
  bounce: BounceRow | null,
  tags: TagRow[],
): EmailMessageDetail {
  return {
    ...toEmailMessageSummary(row, attachments),
    senderAccountEmail: row.sender_account_email,
    senderAccountDisplayName: row.sender_account_display_name,
    toCustomerName: row.to_name ?? row.to_email,
    bodyHtmlRendered: row.body_html_rendered,
    bodyTextRendered: row.body_text_rendered,
    templateId: row.template_id,
    templateName: row.template_name,
    openCount: row.open_count,
    uniqueOpenHint: row.unique_open_hint,
    firstOpenedAt: row.first_opened_at?.toISOString() ?? null,
    lastOpenedAt: row.last_opened_at?.toISOString() ?? null,
    clickCount: row.click_count,
    firstClickedAt: row.first_clicked_at?.toISOString() ?? null,
    lastClickedAt: row.last_clicked_at?.toISOString() ?? null,
    repliedAt: row.replied_at?.toISOString() ?? null,
    bounceType: row.bounce_type,
    bounce: bounce
      ? {
          bounceClass: bounce.bounce_class,
          statusCode: bounce.status_code,
          diagnostic: bounce.diagnostic,
          bouncedAt: bounce.bounced_at?.toISOString() ?? null,
        }
      : null,
    tags: tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
  };
}

export function toTrackingEventSummary(
  row: TrackingEventWithLinkRow,
): TrackingEventSummary {
  return {
    id: row.id,
    eventType: row.event_type,
    occurredAt: row.occurred_at.toISOString(),
    deviceType: row.device_type,
    os: row.os,
    browser: row.browser,
    geoCountry: row.geo_country,
    geoCity: row.geo_city,
    isBot: row.is_bot,
    isProxy: row.is_proxy,
    linkId: row.link_id,
    linkUrl: row.link_original_url,
    linkLabel: row.link_label,
  };
}

export function toEmailLinkClickSummary(
  row: EmailLinkRow,
): EmailLinkClickSummary {
  return {
    id: row.id,
    originalUrl: row.original_url,
    linkLabel: row.link_label,
    position: row.position,
    clickCount: row.click_count,
  };
}

export function toSavedMessageFilter(
  row: SavedMessageFilterRow,
): SavedMessageFilter {
  return {
    id: row.id,
    name: row.name,
    filter: row.filter,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
