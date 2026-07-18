import { Injectable, Logger } from '@nestjs/common';
import { CustomersRepository } from '../database/customers.repository';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import type { EmailMessageRow } from '../database/rows';
import { NotificationsService } from '../notifications/notifications.service';

function describeRecipient(message: {
  to_name: string | null;
  to_email: string;
}): string {
  return message.to_name ?? message.to_email;
}

/**
 * Task 18 (FR-8.7 / FR-2.3) scheduled job, run on the same BullMQ-scheduler
 * pattern as StatsRollupService: each tick it (1) recomputes every
 * customer's engagement score from raw tracking_events, and (2) fires a
 * `follow_up_due` notification for any message whose "remind me if no
 * reply/open in X days" rule has elapsed. Bundled into one job rather than
 * two, matching "don't over-engineer" — both are cheap, idempotent,
 * full-recompute-style operations over the same underlying tables.
 */
@Injectable()
export class EngagementRollupService {
  private readonly logger = new Logger(EngagementRollupService.name);

  constructor(
    private readonly customersRepository: CustomersRepository,
    private readonly emailMessagesRepository: EmailMessagesRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  async run(): Promise<void> {
    const scoredCount =
      await this.customersRepository.recomputeEngagementScores();
    this.logger.log(
      `Recomputed engagement scores for ${scoredCount} customer(s).`,
    );

    const dueMessages = await this.emailMessagesRepository.findDueFollowUps(
      new Date(),
    );
    for (const message of dueMessages) {
      await this.notifyFollowUpDue(message);
      await this.emailMessagesRepository.markFollowUpNotified(message.id);
    }
    if (dueMessages.length > 0) {
      this.logger.log(
        `Fired ${dueMessages.length} follow-up reminder notification(s).`,
      );
    }
  }

  private async notifyFollowUpDue(message: EmailMessageRow): Promise<void> {
    await this.notificationsService.notify({
      userId: message.sent_by,
      type: 'follow_up_due',
      title: `No reply from ${describeRecipient(message)} after ${message.follow_up_days} day(s)`,
      body: message.subject ? `Re: ${message.subject}` : null,
      messageId: message.id,
    });
  }
}
