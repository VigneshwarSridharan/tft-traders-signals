import type {
  BounceSummary,
  LinkClickSummary,
  SentMailDetail,
  SentMailListItem,
  TrackingEventSummary,
} from '@tft/shared';
import type {
  AttachmentRow,
  BounceRow,
  EmailLinkRow,
  EmailMessageRow,
  SenderAccountRow,
  TagRow,
  TrackingEventRow,
} from '../database/rows';
import { toAttachmentSummary } from '../email-messages/email-messages.mapper';
import { toTagSummary } from '../tags/tags.mapper';

export interface TemplateInfo {
  templateId: string;
  templateName: string;
}

export function toSentMailListItem(
  row: EmailMessageRow,
  senderAccount: SenderAccountRow | undefined,
  template: TemplateInfo | undefined,
  tags: TagRow[],
): SentMailListItem {
  return {
    id: row.id,
    toEmail: row.to_email,
    toName: row.to_name,
    subject: row.subject,
    senderAccountId: row.sender_account_id,
    senderAccountEmail: senderAccount?.email ?? '',
    senderAccountDisplayName: senderAccount?.display_name ?? null,
    templateId: template?.templateId ?? null,
    templateName: template?.templateName ?? null,
    status: row.status,
    sentAt: row.sent_at?.toISOString() ?? null,
    queuedAt: row.queued_at?.toISOString() ?? null,
    openCount: row.open_count,
    clickCount: row.click_count,
    repliedAt: row.replied_at?.toISOString() ?? null,
    bounceType: row.bounce_type,
    tags: tags.map(toTagSummary),
    createdAt: row.created_at.toISOString(),
  };
}

export function toLinkClickSummary(row: EmailLinkRow): LinkClickSummary {
  return {
    id: row.id,
    originalUrl: row.original_url,
    linkLabel: row.link_label,
    position: row.position,
    clickCount: row.click_count,
  };
}

export function toTrackingEventSummary(
  row: TrackingEventRow,
  linksById: Map<string, EmailLinkRow>,
): TrackingEventSummary {
  const link = row.link_id ? linksById.get(row.link_id) : undefined;
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
    linkUrl: link?.original_url ?? null,
    linkLabel: link?.link_label ?? null,
  };
}

export function toBounceSummary(row: BounceRow): BounceSummary {
  return {
    bounceClass: row.bounce_class,
    statusCode: row.status_code,
    diagnostic: row.diagnostic,
    bouncedAt: row.bounced_at?.toISOString() ?? null,
  };
}

export function toSentMailDetail(
  row: EmailMessageRow,
  senderAccount: SenderAccountRow | undefined,
  template: TemplateInfo | undefined,
  attachments: AttachmentRow[],
  tags: TagRow[],
  links: EmailLinkRow[],
  events: TrackingEventRow[],
  bounce: BounceRow | null,
): SentMailDetail {
  const linksById = new Map(links.map((link) => [link.id, link]));

  return {
    id: row.id,
    publicToken: row.public_token,
    toEmail: row.to_email,
    toName: row.to_name,
    subject: row.subject,
    bodyHtmlRendered: row.body_html_rendered,
    bodyTextRendered: row.body_text_rendered,
    senderAccountId: row.sender_account_id,
    senderAccountEmail: senderAccount?.email ?? '',
    senderAccountDisplayName: senderAccount?.display_name ?? null,
    customerId: row.customer_id,
    templateId: template?.templateId ?? null,
    templateName: template?.templateName ?? null,
    status: row.status,
    trackingEnabled: row.tracking_enabled,
    smtpResponse: row.smtp_response,
    queuedAt: row.queued_at?.toISOString() ?? null,
    sentAt: row.sent_at?.toISOString() ?? null,
    openCount: row.open_count,
    firstOpenedAt: row.first_opened_at?.toISOString() ?? null,
    lastOpenedAt: row.last_opened_at?.toISOString() ?? null,
    clickCount: row.click_count,
    firstClickedAt: row.first_clicked_at?.toISOString() ?? null,
    lastClickedAt: row.last_clicked_at?.toISOString() ?? null,
    repliedAt: row.replied_at?.toISOString() ?? null,
    bounceType: row.bounce_type,
    bounce: bounce ? toBounceSummary(bounce) : null,
    unsubscribedAt: row.unsubscribed_at?.toISOString() ?? null,
    attachments: attachments.map(toAttachmentSummary),
    tags: tags.map(toTagSummary),
    links: links.map(toLinkClickSummary),
    events: events.map((event) => toTrackingEventSummary(event, linksById)),
    createdAt: row.created_at.toISOString(),
  };
}
