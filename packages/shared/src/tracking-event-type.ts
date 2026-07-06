export const TRACKING_EVENT_TYPES = [
  "open",
  "open_inferred",
  "click",
  "bounce",
  "reply",
  "unsubscribe",
  "spam_report",
] as const;

export type TrackingEventType = (typeof TRACKING_EVENT_TYPES)[number];
