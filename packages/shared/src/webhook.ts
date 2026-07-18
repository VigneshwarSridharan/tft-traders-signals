export const WEBHOOK_EVENT_TYPES = [
  "sent",
  "opened",
  "clicked",
  "bounced",
  "replied",
  "unsubscribed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface WebhookEndpointSummary {
  id: string;
  url: string;
  events: WebhookEventType[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Returned only from the create endpoint — the raw HMAC secret is shown once and never again. */
export interface CreateWebhookEndpointResponse extends WebhookEndpointSummary {
  secret: string;
}

export interface CreateWebhookEndpointRequest {
  url: string;
  events: WebhookEventType[];
}

export interface UpdateWebhookEndpointRequest {
  url?: string;
  events?: WebhookEventType[];
  isActive?: boolean;
}

export interface WebhookDeliverySummary {
  id: string;
  endpointId: string;
  eventType: string;
  attempt: number;
  responseStatus: number | null;
  delivered: boolean;
  createdAt: string;
}

export interface WebhookDeliveryListResponse {
  items: WebhookDeliverySummary[];
  total: number;
  page: number;
  pageSize: number;
}
