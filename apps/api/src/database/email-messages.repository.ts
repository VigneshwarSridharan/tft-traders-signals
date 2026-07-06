import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { MessageStatus } from '@tft/shared';
import { PG_POOL } from './database.constants';
import type { Queryable } from './queryable';
import type { AttachmentRow, EmailMessageRow } from './rows';

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
