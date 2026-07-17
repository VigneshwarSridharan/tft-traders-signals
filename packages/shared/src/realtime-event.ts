import type { MessageStatus } from "./message-status";
import type { TrackingEventType } from "./tracking-event-type";

/** Payload pushed over the `/realtime/stream` SSE endpoint for a single tracking event. */
export interface RealtimeTrackingEvent {
  messageId: string;
  eventType: TrackingEventType;
  occurredAt: string;
  toEmail: string;
  toName: string | null;
  subject: string | null;
  status: MessageStatus;
  openCount: number;
  clickCount: number;
  repliedAt: string | null;
  isFirstOpen: boolean;
  isFirstClick: boolean;
}
