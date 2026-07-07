import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { BounceClass } from '@tft/shared';
import { PG_POOL } from './database.constants';
import type { Queryable } from './queryable';
import type { BounceRow, InboundMessageRow } from './rows';

export interface CreateInboundMessageInput {
  senderAccountId: string;
  imapUid: string;
  messageIdHeader: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  fromEmail: string | null;
  subject: string | null;
  receivedAt: Date | null;
  classification: 'bounce_dsn' | 'reply' | 'other';
  matchedMessageId: string | null;
  rawHeaders: Record<string, unknown>;
}

export interface UpsertBounceInput {
  messageId: string;
  inboundMessageId: string;
  bounceClass: BounceClass;
  statusCode: string | null;
  diagnostic: string | null;
  bouncedAt: Date;
}

@Injectable()
export class InboundRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Idempotent on (sender_account_id, imap_uid); returns null if the UID was already synced. */
  async createInboundMessage(
    input: CreateInboundMessageInput,
    executor: Queryable = this.pool,
  ): Promise<InboundMessageRow | null> {
    const { rows } = await executor.query<InboundMessageRow>(
      `INSERT INTO inbound_messages
         (sender_account_id, imap_uid, message_id_header, in_reply_to, references_header,
          from_email, subject, received_at, classification, matched_message_id, raw_headers)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (sender_account_id, imap_uid) DO NOTHING
       RETURNING *`,
      [
        input.senderAccountId,
        input.imapUid,
        input.messageIdHeader,
        input.inReplyTo,
        input.referencesHeader,
        input.fromEmail,
        input.subject,
        input.receivedAt,
        input.classification,
        input.matchedMessageId,
        JSON.stringify(input.rawHeaders),
      ],
    );
    return rows[0] ?? null;
  }

  /** Upserts the bounce for a message, keeping the most recently observed classification. */
  async upsertBounce(
    input: UpsertBounceInput,
    executor: Queryable = this.pool,
  ): Promise<BounceRow> {
    const { rows } = await executor.query<BounceRow>(
      `INSERT INTO bounces
         (message_id, inbound_message_id, bounce_class, status_code, diagnostic, bounced_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (message_id) DO UPDATE
       SET inbound_message_id = EXCLUDED.inbound_message_id,
           bounce_class = EXCLUDED.bounce_class,
           status_code = EXCLUDED.status_code,
           diagnostic = EXCLUDED.diagnostic,
           bounced_at = EXCLUDED.bounced_at
       RETURNING *`,
      [
        input.messageId,
        input.inboundMessageId,
        input.bounceClass,
        input.statusCode,
        input.diagnostic,
        input.bouncedAt,
      ],
    );
    return rows[0];
  }

  async findBounceByMessageId(messageId: string): Promise<BounceRow | null> {
    const { rows } = await this.pool.query<BounceRow>(
      `SELECT * FROM bounces WHERE message_id = $1`,
      [messageId],
    );
    return rows[0] ?? null;
  }

  /** Count of distinct soft-bounced messages for an email address within the trailing window. */
  async countRecentSoftBounces(
    email: string,
    since: Date,
    executor: Queryable = this.pool,
  ): Promise<number> {
    const { rows } = await executor.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM bounces b
       JOIN email_messages m ON m.id = b.message_id
       WHERE m.to_email = $1
         AND b.bounce_class = 'soft'
         AND b.bounced_at >= $2`,
      [email, since],
    );
    return Number(rows[0]?.count ?? '0');
  }
}
