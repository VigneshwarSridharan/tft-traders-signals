import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type {
  BounceClass,
  MessageListSortField,
  MessageStatus,
} from '@tft/shared';
import { PG_POOL } from './database.constants';
import type { Queryable } from './queryable';
import type { AttachmentRow, EmailMessageRow } from './rows';

export interface EmailMessageListRow extends EmailMessageRow {
  sender_account_email: string;
  sender_account_display_name: string | null;
  template_id: string | null;
  template_name: string | null;
}

export interface EmailMessageListFilter {
  search?: string;
  status?: MessageStatus;
  senderAccountId?: string;
  templateId?: string;
  tagId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sort: MessageListSortField;
  sortDir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

const SORT_COLUMNS: Record<MessageListSortField, string> = {
  sentAt: 'm.sent_at',
  createdAt: 'm.created_at',
  openCount: 'm.open_count',
  clickCount: 'm.click_count',
  status: 'm.status',
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
  queuedAt: Date;
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

  private static readonly LIST_SELECT = `
    SELECT m.*,
           sa.email AS sender_account_email,
           sa.display_name AS sender_account_display_name,
           et.id AS template_id,
           et.name AS template_name
    FROM email_messages m
    JOIN sender_accounts sa ON sa.id = m.sender_account_id
    LEFT JOIN template_versions tv ON tv.id = m.template_version_id
    LEFT JOIN email_templates et ON et.id = tv.template_id
  `;

  async list(
    filter: EmailMessageListFilter,
  ): Promise<{ rows: EmailMessageListRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.search) {
      params.push(`%${filter.search}%`);
      conditions.push(
        `(m.to_email ILIKE $${params.length} OR m.subject ILIKE $${params.length})`,
      );
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`m.status = $${params.length}`);
    }
    if (filter.senderAccountId) {
      params.push(filter.senderAccountId);
      conditions.push(`m.sender_account_id = $${params.length}`);
    }
    if (filter.templateId) {
      params.push(filter.templateId);
      conditions.push(`et.id = $${params.length}`);
    }
    if (filter.dateFrom) {
      params.push(filter.dateFrom);
      conditions.push(`m.sent_at >= $${params.length}`);
    }
    if (filter.dateTo) {
      params.push(filter.dateTo);
      conditions.push(`m.sent_at <= $${params.length}`);
    }
    if (filter.tagId) {
      params.push(filter.tagId);
      conditions.push(
        `EXISTS (
           SELECT 1 FROM taggings tg
           WHERE tg.entity_type = 'message'
             AND tg.entity_id = m.id
             AND tg.tag_id = $${params.length}
         )`,
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortColumn = SORT_COLUMNS[filter.sort];
    const sortDir = filter.sortDir === 'desc' ? 'DESC' : 'ASC';
    const offset = (filter.page - 1) * filter.pageSize;

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM email_messages m
       JOIN sender_accounts sa ON sa.id = m.sender_account_id
       LEFT JOIN template_versions tv ON tv.id = m.template_version_id
       LEFT JOIN email_templates et ON et.id = tv.template_id
       ${whereClause}`,
      params,
    );

    const { rows } = await this.pool.query<EmailMessageListRow>(
      `${EmailMessagesRepository.LIST_SELECT}
       ${whereClause}
       ORDER BY ${sortColumn} ${sortDir}, m.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filter.pageSize, offset],
    );

    return { rows, total: Number(countResult.rows[0]?.count ?? '0') };
  }

  async findDetailById(id: string): Promise<EmailMessageListRow | null> {
    const { rows } = await this.pool.query<EmailMessageListRow>(
      `${EmailMessagesRepository.LIST_SELECT}
       WHERE m.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(input: CreateEmailMessageInput): Promise<EmailMessageRow> {
    const { rows } = await this.pool.query<EmailMessageRow>(
      `INSERT INTO email_messages
         (public_token, sender_account_id, customer_id, template_version_id, sent_by,
          to_email, to_name, subject, body_html_rendered, body_text_rendered,
          message_id_header, tracking_enabled, status, queued_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
      ],
    );
    return rows[0];
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
      `UPDATE email_messages SET status = 'sending' WHERE id = $1`,
      [id],
    );
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
