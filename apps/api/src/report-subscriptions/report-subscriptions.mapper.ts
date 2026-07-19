import type { ReportSubscriptionSummary } from '@tft/shared';
import type { ReportSubscriptionWithSenderRow } from '../database/report-subscriptions.repository';

export function toReportSubscriptionSummary(
  row: ReportSubscriptionWithSenderRow,
): ReportSubscriptionSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    format: row.format,
    filterParams: row.filter_params,
    cadence: row.cadence,
    hourOfDay: row.hour_of_day,
    dayOfWeek: row.day_of_week,
    dayOfMonth: row.day_of_month,
    recipientEmails: row.recipient_emails,
    senderAccountId: row.sender_account_id,
    senderAccountEmail: row.sender_account_email,
    isActive: row.is_active,
    lastRunAt: row.last_run_at ? row.last_run_at.toISOString() : null,
    lastRunError: row.last_run_error,
    nextRunAt: row.next_run_at.toISOString(),
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
