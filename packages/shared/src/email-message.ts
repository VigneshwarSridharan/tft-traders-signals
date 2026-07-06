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
  customerId: string;
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
