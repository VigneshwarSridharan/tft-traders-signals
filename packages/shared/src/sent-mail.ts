import type { AttachmentSummary } from "./email-message";
import type { BounceClass } from "./bounce-class";
import type { MessageBounceType } from "./message-bounce-type";
import type { MessageStatus } from "./message-status";
import type { TagSummary } from "./tag";
import type { TrackingEventSummary } from "./tracking-event";

export const SENT_MAIL_SORT_FIELDS = [
  "sentAt",
  "createdAt",
  "toEmail",
  "subject",
  "status",
] as const;

export type SentMailSortField = (typeof SENT_MAIL_SORT_FIELDS)[number];

export interface SentMailListItem {
  id: string;
  toEmail: string;
  toName: string | null;
  subject: string | null;
  senderAccountId: string;
  senderAccountEmail: string;
  senderAccountDisplayName: string | null;
  templateId: string | null;
  templateName: string | null;
  status: MessageStatus;
  sentAt: string | null;
  queuedAt: string | null;
  openCount: number;
  clickCount: number;
  repliedAt: string | null;
  bounceType: MessageBounceType;
  tags: TagSummary[];
  createdAt: string;
}

export interface SentMailListQuery {
  search?: string;
  status?: MessageStatus;
  senderAccountId?: string;
  templateId?: string;
  tagId?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: SentMailSortField;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface SentMailListResponse {
  items: SentMailListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LinkClickSummary {
  id: string;
  originalUrl: string;
  linkLabel: string | null;
  position: number | null;
  clickCount: number;
}

export interface BounceSummary {
  bounceClass: BounceClass;
  statusCode: string | null;
  diagnostic: string | null;
  bouncedAt: string | null;
}

export interface SentMailDetail {
  id: string;
  publicToken: string;
  toEmail: string;
  toName: string | null;
  subject: string | null;
  bodyHtmlRendered: string | null;
  bodyTextRendered: string | null;
  senderAccountId: string;
  senderAccountEmail: string;
  senderAccountDisplayName: string | null;
  /** Null once the customer has been GDPR-erased; the message row is anonymized and kept for aggregate history. */
  customerId: string | null;
  templateId: string | null;
  templateName: string | null;
  status: MessageStatus;
  trackingEnabled: boolean;
  smtpResponse: string | null;
  queuedAt: string | null;
  sentAt: string | null;
  openCount: number;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  clickCount: number;
  firstClickedAt: string | null;
  lastClickedAt: string | null;
  repliedAt: string | null;
  bounceType: MessageBounceType;
  bounce: BounceSummary | null;
  unsubscribedAt: string | null;
  attachments: AttachmentSummary[];
  tags: TagSummary[];
  links: LinkClickSummary[];
  events: TrackingEventSummary[];
  createdAt: string;
}
