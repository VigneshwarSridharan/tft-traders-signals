import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type {
  BounceClass,
  MessageStatus,
  SentMailSortField,
} from '@tft/shared';
import { PG_POOL } from './database.constants';
import type { Queryable } from './queryable';
import type { AttachmentRow, EmailMessageRow } from './rows';

export interface EmailMessageListFilter {
  search?: string;
  status?: MessageStatus;
  senderAccountId?: string;
  templateId?: string;
  tagId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  /** Restricts results to messages sent by this user — used to scope agents to their own sends. */
  sentBy?: string;
  sort: SentMailSortField;
  sortDir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

const SORT_COLUMNS: Record<SentMailSortField, string> = {
  sentAt: 'sent_at',
  createdAt: 'created_at',
  toEmail: 'to_email',
  subject: 'subject',
  status: 'status',
};

export interface CreateEmailMessageInput {
  publicToken: string;
  senderAccountId: string;
  customerId: string;
  templateVersionId: string | null;
  sentBy: string | null;
  toEmail: string;
  toName: string | null;
  subject: string;
  bodyHtmlRendered: string;
  bodyTextRendered: string | null;
  messageIdHeader: string;
  trackingEnabled: boolean;
  status: MessageStatus;
  queuedAt: Date | null;
  parentMessageId?: string | null;
  inReplyToHeader?: string | null;
  referencesHeader?: string | null;
  followUpDays?: number | null;
}

export interface CreateAttachmentInput {
  messageId: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number;
  storagePath: string;
}

@Injectable()
export class EmailMessagesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: CreateEmailMessageInput): Promise<EmailMessageRow> {
    const { rows } = await this.pool.query<EmailMessageRow>(
      `INSERT INTO email_messages
         (public_token, sender_account_id, customer_id, template_version_id, sent_by,
          to_email, to_name, subject, body_html_rendered, body_text_rendered,
          message_id_header, tracking_enabled, status, queued_at,
          parent_message_id, in_reply_to_header, references_header, follow_up_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        input.publicToken,
        input.senderAccountId,
        input.customerId,
        input.templateVersionId,
        input.sentBy,
        input.toEmail,
        input.toName,
        input.subject,
        input.bodyHtmlRendered,
        input.bodyTextRendered,
        input.messageIdHeader,
        input.trackingEnabled,
        input.status,
        input.queuedAt,
        input.parentMessageId ?? null,
        input.inReplyToHeader ?? null,
        input.referencesHeader ?? null,
        input.followUpDays ?? null,
      ],
    );
    return rows[0];
  }

  async list(
    filter: EmailMessageListFilter,
  ): Promise<{ rows: EmailMessageRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.search) {
      params.push(`%${filter.search}%`);
      conditions.push(
        `(to_email ILIKE $${params.length} OR subject ILIKE $${params.length})`,
      );
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filter.senderAccountId) {
      params.push(filter.senderAccountId);
      conditions.push(`sender_account_id = $${params.length}`);
    }
    if (filter.templateId) {
      params.push(filter.templateId);
      conditions.push(
        `EXISTS (
           SELECT 1 FROM template_versions tv
           WHERE tv.id = email_messages.template_version_id
             AND tv.template_id = $${params.length}
         )`,
      );
    }
    if (filter.tagId) {
      params.push(filter.tagId);
      conditions.push(
        `EXISTS (
           SELECT 1 FROM taggings tg
           WHERE tg.entity_type = 'message'
             AND tg.entity_id = email_messages.id
             AND tg.tag_id = $${params.length}
         )`,
      );
    }
    if (filter.dateFrom) {
      params.push(filter.dateFrom);
      conditions.push(`COALESCE(sent_at, created_at) >= $${params.length}`);
    }
    if (filter.dateTo) {
      params.push(filter.dateTo);
      conditions.push(`COALESCE(sent_at, created_at) <= $${params.length}`);
    }
    if (filter.sentBy) {
      params.push(filter.sentBy);
      conditions.push(`sent_by = $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortColumn = SORT_COLUMNS[filter.sort];
    const sortDir = filter.sortDir === 'desc' ? 'DESC' : 'ASC';
    const offset = (filter.page - 1) * filter.pageSize;

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM email_messages ${whereClause}`,
      params,
    );

    const { rows } = await this.pool.query<EmailMessageRow>(
      `SELECT * FROM email_messages
       ${whereClause}
       ORDER BY ${sortColumn} ${sortDir}, id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filter.pageSize, offset],
    );

    return { rows, total: Number(countResult.rows[0]?.count ?? '0') };
  }

  async findById(id: string): Promise<EmailMessageRow | null> {
    const { rows } = await this.pool.query<EmailMessageRow>(
      `SELECT * FROM email_messages WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByPublicToken(
    publicToken: string,
  ): Promise<EmailMessageRow | null> {
    const { rows } = await this.pool.query<EmailMessageRow>(
      `SELECT * FROM email_messages WHERE public_token = $1`,
      [publicToken],
    );
    return rows[0] ?? null;
  }

  async recordOpen(
    id: string,
    occurredAt: Date,
    executor: Queryable = this.pool,
  ): Promise<void> {
    await executor.query(
      `UPDATE email_messages
       SET open_count = open_count + 1,
           unique_open_hint = true,
           first_opened_at = COALESCE(first_opened_at, $2),
           last_opened_at = $2
       WHERE id = $1`,
      [id, occurredAt],
    );
  }

  async recordClick(
    id: string,
    occurredAt: Date,
    executor: Queryable = this.pool,
  ): Promise<void> {
    await executor.query(
      `UPDATE email_messages
       SET click_count = click_count + 1,
           first_clicked_at = COALESCE(first_clicked_at, $2),
           last_clicked_at = $2
       WHERE id = $1`,
      [id, occurredAt],
    );
  }

  async markSending(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE email_messages
       SET status = 'sending', queued_at = COALESCE(queued_at, now())
       WHERE id = $1`,
      [id],
    );
  }

  /** Cancels a scheduled message; no-ops if it's already left the `scheduled` state. */
  async markCancelled(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE email_messages SET status = 'cancelled' WHERE id = $1 AND status = 'scheduled'`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  async markSent(
    id: string,
    smtpResponse: string,
    sentAt: Date,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE email_messages
       SET status = 'sent', smtp_response = $2, sent_at = $3
       WHERE id = $1`,
      [id, smtpResponse, sentAt],
    );
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.pool.query(
      `UPDATE email_messages SET status = 'failed', smtp_response = $2 WHERE id = $1`,
      [id, errorMessage],
    );
  }

  async markQueued(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE email_messages SET status = 'queued' WHERE id = $1`,
      [id],
    );
  }

  async findByMessageIdHeader(
    messageIdHeader: string,
    executor: Queryable = this.pool,
  ): Promise<EmailMessageRow | null> {
    const { rows } = await executor.query<EmailMessageRow>(
      `SELECT * FROM email_messages WHERE message_id_header = $1`,
      [messageIdHeader],
    );
    return rows[0] ?? null;
  }

  async markBounced(
    id: string,
    bounceType: BounceClass,
    bouncedAt: Date,
    executor: Queryable = this.pool,
  ): Promise<void> {
    await executor.query(
      `UPDATE email_messages
       SET status = 'bounced', bounce_type = $2, smtp_response = COALESCE(smtp_response, $3)
       WHERE id = $1`,
      [id, bounceType, `bounced at ${bouncedAt.toISOString()}`],
    );
  }

  /** Sets `unsubscribed_at` on first unsubscribe only — idempotent for repeat clicks/one-click POSTs. */
  async markUnsubscribed(
    id: string,
    unsubscribedAt: Date,
    executor: Queryable = this.pool,
  ): Promise<void> {
    await executor.query(
      `UPDATE email_messages SET unsubscribed_at = COALESCE(unsubscribed_at, $2) WHERE id = $1`,
      [id, unsubscribedAt],
    );
  }

  /** Sets `replied_at` on first reply only — a later reply in the same thread never overwrites the original timestamp. */
  async markReplied(
    id: string,
    repliedAt: Date,
    executor: Queryable = this.pool,
  ): Promise<void> {
    await executor.query(
      `UPDATE email_messages SET replied_at = COALESCE(replied_at, $2) WHERE id = $1`,
      [id, repliedAt],
    );
  }

  /** `sent` messages older than the delivery-heuristic window with no bounce are assumed delivered. */
  async markDeliveredAfterHeuristic(hours: number): Promise<string[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      `UPDATE email_messages
       SET status = 'delivered'
       WHERE status = 'sent'
         AND sent_at IS NOT NULL
         AND sent_at < now() - ($1 || ' hours')::interval
       RETURNING id`,
      [hours],
    );
    return rows.map((row) => row.id);
  }

  async createAttachment(input: CreateAttachmentInput): Promise<AttachmentRow> {
    const { rows } = await this.pool.query<AttachmentRow>(
      `INSERT INTO attachments (message_id, filename, content_type, size_bytes, storage_path)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.messageId,
        input.filename,
        input.contentType,
        input.sizeBytes,
        input.storagePath,
      ],
    );
    return rows[0];
  }

  async getAttachments(messageId: string): Promise<AttachmentRow[]> {
    const { rows } = await this.pool.query<AttachmentRow>(
      `SELECT * FROM attachments WHERE message_id = $1 ORDER BY created_at ASC`,
      [messageId],
    );
    return rows;
  }

  /** All messages sent to a customer, newest first — feeds the customer-profile communication timeline. */
  async listForCustomer(customerId: string): Promise<EmailMessageRow[]> {
    const { rows } = await this.pool.query<EmailMessageRow>(
      `SELECT * FROM email_messages
       WHERE customer_id = $1
       ORDER BY COALESCE(sent_at, created_at) DESC`,
      [customerId],
    );
    return rows;
  }

  /**
   * Messages with a per-send follow-up rule (Task 18 / FR-8.7) whose window
   * has elapsed with neither a reply nor an open, and that haven't already
   * fired their reminder. Driven by the partial index on
   * (follow_up_days IS NOT NULL AND follow_up_notified_at IS NULL).
   */
  async findDueFollowUps(now: Date): Promise<EmailMessageRow[]> {
    const { rows } = await this.pool.query<EmailMessageRow>(
      `SELECT * FROM email_messages
       WHERE follow_up_days IS NOT NULL
         AND follow_up_notified_at IS NULL
         AND replied_at IS NULL
         AND first_opened_at IS NULL
         AND status IN ('sent', 'delivered')
         AND sent_at IS NOT NULL
         AND sent_at <= $1::timestamptz - (follow_up_days || ' days')::interval`,
      [now],
    );
    return rows;
  }

  /** Marks a follow-up reminder as fired so the rollup job never re-notifies for the same message. */
  async markFollowUpNotified(
    id: string,
    executor: Queryable = this.pool,
  ): Promise<void> {
    await executor.query(
      `UPDATE email_messages SET follow_up_notified_at = now() WHERE id = $1`,
      [id],
    );
  }

  /**
   * GDPR erasure: strips PII from every message sent to this customer
   * (rendered body snapshots, to/name) and detaches customer_id — the
   * message row itself, its counters, and its tracking_events survive so
   * aggregate analytics stay consistent. Returns the number of rows touched.
   */
  async anonymizeForCustomer(
    customerId: string,
    anonymizedEmail: string,
    executor: Queryable = this.pool,
  ): Promise<number> {
    const { rowCount } = await executor.query(
      `UPDATE email_messages
       SET customer_id = NULL,
           to_email = $2,
           to_name = 'Erased customer',
           subject = NULL,
           body_html_rendered = NULL,
           body_text_rendered = NULL
       WHERE customer_id = $1`,
      [customerId, anonymizedEmail],
    );
    return rowCount ?? 0;
  }

  async getAttachmentsForMessages(
    messageIds: string[],
  ): Promise<Map<string, AttachmentRow[]>> {
    if (messageIds.length === 0) {
      return new Map();
    }
    const { rows } = await this.pool.query<AttachmentRow>(
      `SELECT * FROM attachments WHERE message_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
      [messageIds],
    );
    const map = new Map<string, AttachmentRow[]>();
    for (const row of rows) {
      const list = map.get(row.message_id) ?? [];
      list.push(row);
      map.set(row.message_id, list);
    }
    return map;
  }
}
