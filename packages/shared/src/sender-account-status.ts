export const SENDER_ACCOUNT_STATUSES = [
  "active",
  "disabled",
  "auth_failed",
] as const;

export type SenderAccountStatus = (typeof SENDER_ACCOUNT_STATUSES)[number];
