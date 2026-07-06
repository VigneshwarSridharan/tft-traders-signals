export const SUPPRESSION_REASONS = [
  "hard_bounce",
  "soft_bounce_repeat",
  "unsubscribe",
  "manual",
  "spam_report",
] as const;

export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export interface SuppressionSummary {
  id: string;
  email: string;
  customerId: string | null;
  reason: SuppressionReason;
  sourceMessageId: string | null;
  suppressedAt: string;
  releasedAt: string | null;
  releasedBy: string | null;
  createdAt: string;
}

export interface CreateSuppressionRequest {
  email: string;
  customerId?: string;
}
