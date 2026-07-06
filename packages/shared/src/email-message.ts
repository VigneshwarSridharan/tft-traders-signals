import type { BounceClass } from "./bounce-class";
import type { MessageStatus } from "./message-status";
import type { TagSummary } from "./tag";
import type { TrackingEventType } from "./tracking-event-type";

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

export const MESSAGE_LIST_SORT_FIELDS = [
  "sentAt",
  "createdAt",
  "openCount",
  "clickCount",
  "status",
] as const;

export type MessageListSortField = (typeof MESSAGE_LIST_SORT_FIELDS)[number];

export interface EmailMessageListItem {
  id: string;
  toName: string | null;
  toEmail: string;
  senderAccountId: string;
  senderAccountEmail: string;
  senderAccountDisplayName: string | null;
  templateId: string | null;
  templateName: string | null;
  subject: string | null;
  status: MessageStatus;
  sentAt: string | null;
  createdAt: string;
  openCount: number;
  clickCount: number;
  repliedAt: string | null;
  tags: TagSummary[];
}

export interface EmailMessageListQuery {
  search?: string;
  status?: MessageStatus;
  senderAccountId?: string;
  templateId?: string;
  tagId?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: MessageListSortField;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface EmailMessageListResponse {
  items: EmailMessageListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BounceSummary {
  bounceClass: BounceClass;
  statusCode: string | null;
  diagnostic: string | null;
  bouncedAt: string | null;
}

export interface EmailMessageDetail extends EmailMessageSummary {
  senderAccountEmail: string;
  senderAccountDisplayName: string | null;
  toCustomerName: string;
  bodyHtmlRendered: string | null;
  bodyTextRendered: string | null;
  templateId: string | null;
  templateName: string | null;
  openCount: number;
  uniqueOpenHint: boolean;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  clickCount: number;
  firstClickedAt: string | null;
  lastClickedAt: string | null;
  repliedAt: string | null;
  bounceType: BounceClass | "none";
  bounce: BounceSummary | null;
  tags: TagSummary[];
}

export interface TrackingEventSummary {
  id: string;
  eventType: TrackingEventType;
  occurredAt: string;
  deviceType: string | null;
  os: string | null;
  browser: string | null;
  geoCountry: string | null;
  geoCity: string | null;
  isBot: boolean;
  isProxy: boolean;
  linkId: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
}

export interface EmailLinkClickSummary {
  id: string;
  originalUrl: string;
  linkLabel: string | null;
  position: number | null;
  clickCount: number;
}

export interface EmailMessageTimelineResponse {
  events: TrackingEventSummary[];
  links: EmailLinkClickSummary[];
}

export interface SavedMessageFilter {
  id: string;
  name: string;
  filter: EmailMessageListQuery;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSavedMessageFilterRequest {
  name: string;
  filter: EmailMessageListQuery;
}
