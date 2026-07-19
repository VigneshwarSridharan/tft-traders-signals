import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { MessageStatus } from '@tft/shared';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import {
  ReportSubscriptionsRepository,
  type ReportSubscriptionWithSenderRow,
} from '../database/report-subscriptions.repository';
import { SenderAccountsRepository } from '../database/sender-accounts.repository';
import { UsersRepository } from '../database/users.repository';
import { EmailSenderService } from '../send/email-sender.service';
import { ReportsService } from '../reports/reports.service';
import { computeNextRunAt } from './report-subscription-schedule.util';

// A subscription with no lastDays filter gets a sensible default window
// per cadence rather than an unbounded "everything ever sent" query.
const DEFAULT_LAST_DAYS: Record<'daily' | 'weekly' | 'monthly', number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

@Injectable()
export class ReportSubscriptionRunnerService {
  private readonly logger = new Logger(ReportSubscriptionRunnerService.name);

  constructor(
    private readonly reportSubscriptionsRepository: ReportSubscriptionsRepository,
    private readonly senderAccountsRepository: SenderAccountsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly reportsService: ReportsService,
    private readonly emailSenderService: EmailSenderService,
    private readonly auditLogsRepository: AuditLogsRepository,
  ) {}

  async runDue(now: Date = new Date()): Promise<void> {
    const due = await this.reportSubscriptionsRepository.findDue(now);
    for (const subscription of due) {
      await this.runOne(subscription, now);
    }
  }

  /** Admin/manager-triggered manual run, bypassing the `next_run_at` due check. */
  async runNow(id: string, now: Date = new Date()): Promise<void> {
    const subscription = await this.reportSubscriptionsRepository.findById(id);
    if (!subscription) {
      throw new NotFoundException('Report subscription not found');
    }
    await this.runOne(subscription, now);
  }

  private async runOne(
    subscription: ReportSubscriptionWithSenderRow,
    now: Date,
  ): Promise<void> {
    const nextRunAt = computeNextRunAt(
      {
        cadence: subscription.cadence,
        hourOfDay: subscription.hour_of_day,
        dayOfWeek: subscription.day_of_week,
        dayOfMonth: subscription.day_of_month,
      },
      now,
    );

    try {
      await this.send(subscription, now);
      await this.reportSubscriptionsRepository.recordRun(subscription.id, {
        ranAt: now,
        nextRunAt,
        error: null,
      });
      await this.auditLogsRepository.record({
        userId: subscription.created_by,
        action: 'report_subscription.run',
        entityType: 'report_subscription',
        entityId: subscription.id,
        metadata: { kind: subscription.kind, format: subscription.format },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Report subscription ${subscription.id} (${subscription.name}) failed: ${message}`,
      );
      await this.reportSubscriptionsRepository.recordRun(subscription.id, {
        ranAt: now,
        nextRunAt,
        error: message,
      });
    }
  }

  private async send(
    subscription: ReportSubscriptionWithSenderRow,
    now: Date,
  ): Promise<void> {
    const creator = await this.usersRepository.findById(
      subscription.created_by,
    );
    if (!creator) {
      throw new Error('Subscription owner no longer exists');
    }
    const currentUser: AccessTokenPayload = {
      sub: creator.id,
      email: creator.email,
      role: creator.role,
    };

    const senderAccount = await this.senderAccountsRepository.findById(
      subscription.sender_account_id,
    );
    if (!senderAccount) {
      throw new Error('Sender account no longer exists');
    }
    if (senderAccount.status !== 'active') {
      throw new Error(`Sender account is ${senderAccount.status}`);
    }

    const { dateFrom, dateTo } = this.resolveDateRange(subscription, now);
    const filter = subscription.filter_params as {
      senderAccountId?: string;
      templateId?: string;
      tagId?: string;
      status?: MessageStatus;
    };

    const file =
      subscription.kind === 'analytics_pdf'
        ? await this.reportsService.generateAnalyticsPdf(
            {
              dateFrom,
              dateTo,
              senderAccountId: filter.senderAccountId,
              templateId: filter.templateId,
            },
            currentUser,
          )
        : await this.reportsService.exportSentMail(
            {
              format: subscription.format as 'csv' | 'xlsx',
              status: filter.status,
              senderAccountId: filter.senderAccountId,
              templateId: filter.templateId,
              tagId: filter.tagId,
              dateFrom,
              dateTo,
              sort: 'sentAt',
              sortDir: 'desc',
            },
            currentUser,
          );

    await this.emailSenderService.sendNow({
      senderAccount,
      to: subscription.recipient_emails.join(', '),
      subject: `${subscription.name} — ${now.toISOString().slice(0, 10)}`,
      html: `<p>Attached is your scheduled report "${subscription.name}".</p>`,
      text: `Attached is your scheduled report "${subscription.name}".`,
      attachments: [
        {
          filename: file.filename,
          content: file.buffer,
          contentType: file.contentType,
        },
      ],
    });
  }

  private resolveDateRange(
    subscription: ReportSubscriptionWithSenderRow,
    now: Date,
  ): { dateFrom: Date; dateTo: Date } {
    const filter = subscription.filter_params as { lastDays?: number };
    const lastDays = filter.lastDays ?? DEFAULT_LAST_DAYS[subscription.cadence];
    const dateFrom = new Date(now.getTime() - lastDays * 24 * 60 * 60 * 1000);
    return { dateFrom, dateTo: now };
  }
}
