import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.constants';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { SuppressionsRepository } from '../database/suppressions.repository';
import { TrackingEventsRepository } from '../database/tracking-events.repository';
import type { EmailMessageRow } from '../database/rows';
import { withTransaction } from '../database/transaction.util';
import { WebhookDispatchService } from '../webhooks/webhook-dispatch.service';

@Injectable()
export class UnsubscribeService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly emailMessagesRepository: EmailMessagesRepository,
    private readonly trackingEventsRepository: TrackingEventsRepository,
    private readonly suppressionsRepository: SuppressionsRepository,
    private readonly auditLogsRepository: AuditLogsRepository,
    private readonly webhookDispatchService?: WebhookDispatchService,
  ) {}

  async findMessageByToken(token: string): Promise<EmailMessageRow | null> {
    return this.emailMessagesRepository.findByPublicToken(token);
  }

  /**
   * Idempotent: re-unsubscribing (a second click, or a mail client that
   * retries the one-click POST) just no-ops the parts that already fired.
   */
  async unsubscribe(
    token: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<{ email: string } | null> {
    const message = await this.emailMessagesRepository.findByPublicToken(token);
    if (!message) {
      return null;
    }
    const wasAlreadyUnsubscribed = message.unsubscribed_at !== null;

    const occurredAt = new Date();
    await withTransaction(this.pool, async (client) => {
      await this.trackingEventsRepository.insert(
        {
          messageId: message.id,
          linkId: null,
          eventType: 'unsubscribe',
          occurredAt,
          ip,
          userAgent,
          deviceType: null,
          os: null,
          browser: null,
          geoCountry: null,
          geoCity: null,
          isBot: false,
          isProxy: false,
          metadata: {},
        },
        client,
      );

      await this.emailMessagesRepository.markUnsubscribed(
        message.id,
        occurredAt,
        client,
      );

      await this.suppressionsRepository.upsert(
        {
          email: message.to_email,
          customerId: message.customer_id,
          reason: 'unsubscribe',
          sourceMessageId: message.id,
        },
        client,
      );

      await this.auditLogsRepository.record(
        {
          userId: null,
          action: 'unsubscribe.recorded',
          entityType: 'email_message',
          entityId: message.id,
          metadata: { email: message.to_email },
        },
        client,
      );
    });

    // Idempotent: a repeat one-click POST (or a second confirm-page submit)
    // must not re-fire the webhook event for an address that was already
    // unsubscribed before this call.
    if (!wasAlreadyUnsubscribed) {
      await this.webhookDispatchService?.dispatch('unsubscribed', {
        messageId: message.id,
        toEmail: message.to_email,
      });
    }

    return { email: message.to_email };
  }
}
