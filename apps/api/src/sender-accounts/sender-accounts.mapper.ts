import type { SenderAccountSummary } from '@tft/shared';
import type { SenderAccountRow } from '../database/rows';
import type { SenderAccountUsage } from '../database/sender-accounts.repository';

export function toSenderAccountSummary(
  row: SenderAccountRow,
  usage: SenderAccountUsage,
): SenderAccountSummary {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    imapHost: row.imap_host,
    imapPort: row.imap_port,
    signatureHtml: row.signature_html,
    dailyQuota: row.daily_quota,
    hourlyQuota: row.hourly_quota,
    dailyUsed: usage.dailyUsed,
    hourlyUsed: usage.hourlyUsed,
    status: row.status,
    lastVerifiedAt: row.last_verified_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}
