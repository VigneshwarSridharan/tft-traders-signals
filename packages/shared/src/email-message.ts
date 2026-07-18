import type { MessageStatus } from "./message-status";

export interface AttachmentSummary {
  id: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number;
}

export interface EmailMessageSummary {
  id: string;
  publicToken: string;
  senderAccountId: string;
  /** Null once the customer has been GDPR-erased; the message row is anonymized and kept for aggregate history. */
  customerId: string | null;
  templateVersionId: string | null;
  toEmail: string;
  toName: string | null;
  subject: string | null;
  status: MessageStatus;
  trackingEnabled: boolean;
  smtpResponse: string | null;
  queuedAt: string | null;
  sentAt: string | null;
  attachments: AttachmentSummary[];
  createdAt: string;
}

export interface ComposeSendRequest {
  senderAccountId: string;
  customerIds: string[];
  templateVersionId?: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string | null;
  fallbackValues?: Record<string, string>;
  trackingEnabled?: boolean;
  overrideSuppression?: boolean;
  scheduledFor?: string;
  timezone?: string;
  /** Threads this send against a prior message (In-Reply-To/References); requires exactly one recipient. */
  parentMessageId?: string;
  /** "Remind me if no reply/open in X days" — the per-send follow-up rule (FR-8.7). */
  followUpDays?: number;
}

export interface ComposeRecipientResult {
  customerId: string;
  ok: boolean;
  messageId: string | null;
  error: string | null;
}

export interface ComposeSendResponse {
  results: ComposeRecipientResult[];
}

export interface ComposeSenderAccountOption {
  id: string;
  email: string;
  displayName: string | null;
  dailyQuota: number | null;
  dailyUsed: number;
  hourlyQuota: number | null;
  hourlyUsed: number;
}

export interface ComposeTestSendRequest {
  senderAccountId: string;
  templateVersionId?: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string | null;
  customerId?: string;
  fallbackValues?: Record<string, string>;
}

export interface ComposeTestSendResponse {
  accepted: boolean;
  to: string;
  smtpResponse: string;
  unresolvedPlaceholders: string[];
}

/**
 * One-click follow-up compose: everything needed to pre-fill the compose
 * form for a reply to `parentMessageId`, addressed to the same customer and
 * (if the seeded "Follow-up" template category has one) a starting template.
 */
export interface FollowUpDraftResponse {
  parentMessageId: string;
  customerId: string;
  senderAccountId: string;
  categoryId: string | null;
  templateId: string | null;
  subject: string;
}
