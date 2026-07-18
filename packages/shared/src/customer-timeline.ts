export const CUSTOMER_TIMELINE_EVENT_TYPES = [
  "sent",
  "open",
  "click",
  "reply",
  "bounce",
  "unsubscribe",
] as const;

export type CustomerTimelineEventType =
  (typeof CUSTOMER_TIMELINE_EVENT_TYPES)[number];

/** One entry in a customer's full communication history — a send, or an event (open/click/reply/bounce/unsubscribe) on one of their messages. */
export interface CustomerTimelineEntry {
  id: string;
  type: CustomerTimelineEventType;
  occurredAt: string;
  messageId: string;
  subject: string | null;
  detail: string | null;
}

export interface CustomerTimelineResponse {
  items: CustomerTimelineEntry[];
}
