import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow, type FetchMessageObject } from 'imapflow';
import type { Pool } from 'pg';
import type { EnvConfig } from '../config/env.validation';
import { decryptSecret } from '../common/crypto.util';
import { PG_POOL } from '../database/database.constants';
import type { Queryable } from '../database/queryable';
import { withTransaction } from '../database/transaction.util';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { InboundRepository } from '../database/inbound.repository';
import { SenderAccountsRepository } from '../database/sender-accounts.repository';
import { SuppressionsRepository } from '../database/suppressions.repository';
import { TrackingEventsRepository } from '../database/tracking-events.repository';
import type { EmailMessageRow, SenderAccountRow } from '../database/rows';
import { parseDsn } from './dsn-parser.util';

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown IMAP error';
}

@Injectable()
export class InboundSyncService {
  private readonly logger = new Logger(InboundSyncService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly senderAccountsRepository: SenderAccountsRepository,
    private readonly inboundRepository: InboundRepository,
    private readonly emailMessagesRepository: EmailMessagesRepository,
    private readonly suppressionsRepository: SuppressionsRepository,
    private readonly trackingEventsRepository: TrackingEventsRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async syncAllAccounts(): Promise<void> {
    const accounts = await this.senderAccountsRepository.listActive();
    for (const account of accounts) {
      try {
        await this.syncAccount(account);
      } catch (error) {
        this.logger.error(
          `IMAP sync failed for sender account ${account.email}: ${toErrorMessage(error)}`,
        );
      }
    }
  }

  async syncAccount(account: SenderAccountRow): Promise<void> {
    const password = decryptSecret(
      account.credential_enc,
      this.configService.get('APP_ENCRYPTION_KEY', { infer: true }),
    );

    const client = new ImapFlow({
      host: account.imap_host,
      port: account.imap_port,
      secure: true,
      auth: { user: account.email, pass: password },
      logger: false,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        await this.syncMailbox(client, account);
      } finally {
        lock.release();
      }
    } finally {
      if (client.usable) {
        await client.logout().catch(() => undefined);
      } else {
        client.close();
      }
    }
  }

  private async syncMailbox(
    client: ImapFlow,
    account: SenderAccountRow,
  ): Promise<void> {
    const startUid = Number(account.imap_last_uid) + 1;
    const mailbox = client.mailbox;
    if (!mailbox || mailbox.exists === 0 || mailbox.uidNext < startUid) {
      return;
    }

    let highestUidSeen = Number(account.imap_last_uid);
    for await (const message of client.fetch(
      `${startUid}:*`,
      { uid: true, source: true, envelope: true },
      { uid: true },
    )) {
      if (message.uid < startUid) {
        // The server may include the boundary message even when it predates
        // our cursor; nothing new to do with it.
        continue;
      }
      await this.processMessage(account, message);
      if (message.uid > highestUidSeen) {
        highestUidSeen = message.uid;
        await this.senderAccountsRepository.updateImapLastUid(
          account.id,
          highestUidSeen.toString(),
        );
      }
    }
  }

  /** Exposed (not just `private`) so the bounce/suppression logic is directly unit-testable. */
  async processMessage(
    account: SenderAccountRow,
    message: FetchMessageObject,
  ): Promise<void> {
    const source = message.source;
    if (!source) {
      return;
    }

    const dsn = await parseDsn(source);

    await withTransaction(this.pool, async (client) => {
      const bounceMatchedMessage =
        dsn.isDsn && dsn.originalMessageId
          ? await this.emailMessagesRepository.findByMessageIdHeader(
              dsn.originalMessageId,
              client,
            )
          : null;

      // A DSN's own Message-ID never correlates to anything we sent, so reply
      // correlation is only attempted on non-DSN mail. In-Reply-To is checked
      // first (the direct parent); References (oldest-first, per RFC 5322 §3.6.4)
      // is the fallback for clients that omit In-Reply-To.
      const replyCandidateIds = dsn.isDsn
        ? []
        : Array.from(
            new Set(
              [dsn.inReplyTo, ...dsn.references].filter((id): id is string =>
                Boolean(id),
              ),
            ),
          );
      let replyMatchedMessage: EmailMessageRow | null = null;
      for (const candidateId of replyCandidateIds) {
        replyMatchedMessage =
          await this.emailMessagesRepository.findByMessageIdHeader(
            candidateId,
            client,
          );
        if (replyMatchedMessage) break;
      }

      const classification = dsn.isDsn
        ? 'bounce_dsn'
        : replyMatchedMessage
          ? 'reply'
          : 'other';

      const inbound = await this.inboundRepository.createInboundMessage(
        {
          senderAccountId: account.id,
          imapUid: message.uid.toString(),
          messageIdHeader: message.envelope?.messageId ?? null,
          inReplyTo: dsn.inReplyTo,
          referencesHeader: dsn.references.join(' ') || null,
          fromEmail: message.envelope?.from?.[0]?.address ?? null,
          subject: message.envelope?.subject ?? null,
          receivedAt: message.envelope?.date ?? null,
          classification,
          matchedMessageId:
            bounceMatchedMessage?.id ?? replyMatchedMessage?.id ?? null,
          rawHeaders: {
            statusCode: dsn.statusCode,
            diagnostic: dsn.diagnostic,
            finalRecipient: dsn.finalRecipient,
          },
        },
        client,
      );

      if (!inbound) {
        // Already synced in a prior (possibly crashed) run — cursor still advances.
        return;
      }

      if (dsn.isDsn && dsn.bounceClass && bounceMatchedMessage) {
        const bouncedAt = message.envelope?.date ?? new Date();
        if (bounceMatchedMessage.status !== 'bounced') {
          await this.emailMessagesRepository.markBounced(
            bounceMatchedMessage.id,
            dsn.bounceClass,
            bouncedAt,
            client,
          );
        }
        await this.inboundRepository.upsertBounce(
          {
            messageId: bounceMatchedMessage.id,
            inboundMessageId: inbound.id,
            bounceClass: dsn.bounceClass,
            statusCode: dsn.statusCode,
            diagnostic: dsn.diagnostic,
            bouncedAt,
          },
          client,
        );
        await this.applySuppressionPolicy(
          bounceMatchedMessage,
          dsn.bounceClass,
          client,
        );
      }

      // Only the first reply on a thread emits an event/timestamp — later
      // replies to the same message still classify as 'reply' in the audit
      // trail (inbound_messages) but don't inflate the reply-rate metric.
      if (
        classification === 'reply' &&
        replyMatchedMessage &&
        !replyMatchedMessage.replied_at
      ) {
        const repliedAt = message.envelope?.date ?? new Date();
        await this.trackingEventsRepository.insert(
          {
            messageId: replyMatchedMessage.id,
            linkId: null,
            eventType: 'reply',
            occurredAt: repliedAt,
            ip: null,
            userAgent: null,
            deviceType: null,
            os: null,
            browser: null,
            geoCountry: null,
            geoCity: null,
            isBot: false,
            isProxy: false,
            metadata: { inboundMessageId: inbound.id },
          },
          client,
        );
        await this.emailMessagesRepository.markReplied(
          replyMatchedMessage.id,
          repliedAt,
          client,
        );
      }
    });
  }

  private async applySuppressionPolicy(
    matchedMessage: { id: string; to_email: string; customer_id: string },
    bounceClass: 'hard' | 'soft',
    client: Queryable,
  ): Promise<void> {
    if (bounceClass === 'hard') {
      await this.suppressionsRepository.upsert(
        {
          email: matchedMessage.to_email,
          customerId: matchedMessage.customer_id,
          reason: 'hard_bounce',
          sourceMessageId: matchedMessage.id,
        },
        client,
      );
      return;
    }

    const threshold = this.configService.get(
      'SOFT_BOUNCE_SUPPRESSION_THRESHOLD',
      { infer: true },
    );
    const windowDays = this.configService.get(
      'SOFT_BOUNCE_SUPPRESSION_WINDOW_DAYS',
      { infer: true },
    );
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const softBounceCount = await this.inboundRepository.countRecentSoftBounces(
      matchedMessage.to_email,
      since,
      client,
    );
    if (softBounceCount >= threshold) {
      await this.suppressionsRepository.upsert(
        {
          email: matchedMessage.to_email,
          customerId: matchedMessage.customer_id,
          reason: 'soft_bounce_repeat',
          sourceMessageId: matchedMessage.id,
        },
        client,
      );
    }
  }
}
