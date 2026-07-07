import type { TrackingEventType } from "./tracking-event-type";

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
