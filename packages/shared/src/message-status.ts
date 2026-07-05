export const MESSAGE_STATUSES = [
  "draft",
  "queued",
  "scheduled",
  "sending",
  "sent",
  "delivered",
  "bounced",
  "failed",
  "cancelled",
] as const;

export type MessageStatus = (typeof MESSAGE_STATUSES)[number];
