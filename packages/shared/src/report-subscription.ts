export const REPORT_SUBSCRIPTION_KINDS = ["analytics_pdf", "sent_mail"] as const;
export type ReportSubscriptionKind = (typeof REPORT_SUBSCRIPTION_KINDS)[number];

export const REPORT_SUBSCRIPTION_FORMATS = ["pdf", "csv", "xlsx"] as const;
export type ReportSubscriptionFormat =
  (typeof REPORT_SUBSCRIPTION_FORMATS)[number];

export const REPORT_SUBSCRIPTION_CADENCES = [
  "daily",
  "weekly",
  "monthly",
] as const;
export type ReportSubscriptionCadence =
  (typeof REPORT_SUBSCRIPTION_CADENCES)[number];

/** Filters reused from the on-demand Task 22 export/PDF endpoints, minus
 * absolute dateFrom/dateTo which don't make sense for a recurring job. */
export interface ReportSubscriptionFilterParams {
  lastDays?: number;
  senderAccountId?: string;
  templateId?: string;
  tagId?: string;
  status?: string;
}

export interface ReportSubscriptionSummary {
  id: string;
  name: string;
  kind: ReportSubscriptionKind;
  format: ReportSubscriptionFormat;
  filterParams: ReportSubscriptionFilterParams;
  cadence: ReportSubscriptionCadence;
  hourOfDay: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  recipientEmails: string[];
  senderAccountId: string;
  senderAccountEmail: string;
  isActive: boolean;
  lastRunAt: string | null;
  lastRunError: string | null;
  nextRunAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReportSubscriptionRequest {
  name: string;
  kind: ReportSubscriptionKind;
  format: ReportSubscriptionFormat;
  filterParams?: ReportSubscriptionFilterParams;
  cadence: ReportSubscriptionCadence;
  hourOfDay?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  recipientEmails: string[];
  senderAccountId: string;
  isActive?: boolean;
}

export interface UpdateReportSubscriptionRequest {
  name?: string;
  filterParams?: ReportSubscriptionFilterParams;
  cadence?: ReportSubscriptionCadence;
  hourOfDay?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  recipientEmails?: string[];
  senderAccountId?: string;
  isActive?: boolean;
}
