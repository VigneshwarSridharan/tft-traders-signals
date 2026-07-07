import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './database.constants';
import type { ScheduledSendRow } from './rows';

export interface CreateScheduledSendInput {
  messageId: string;
  scheduledFor: Date;
  timezone: string | null;
  jobId: string;
}

export interface ScheduledSendListRow extends ScheduledSendRow {
  to_email: string;
  to_name: string | null;
  subject: string | null;
  sender_account_id: string;
  sender_account_email: string;
  sender_account_display_name: string | null;
}

@Injectable()
export class ScheduledSendsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: CreateScheduledSendInput): Promise<ScheduledSendRow> {
    const { rows } = await this.pool.query<ScheduledSendRow>(
      `INSERT INTO scheduled_sends (message_id, scheduled_for, timezone, job_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.messageId, input.scheduledFor, input.timezone, input.jobId],
    );
    return rows[0];
  }

  async findByMessageId(messageId: string): Promise<ScheduledSendRow | null> {
    const { rows } = await this.pool.query<ScheduledSendRow>(
      `SELECT * FROM scheduled_sends WHERE message_id = $1`,
      [messageId],
    );
    return rows[0] ?? null;
  }

  /** Reschedules a still-pending send; returns null if it was already cancelled or dispatched. */
  async reschedule(
    messageId: string,
    scheduledFor: Date,
    jobId: string,
  ): Promise<ScheduledSendRow | null> {
    const { rows } = await this.pool.query<ScheduledSendRow>(
      `UPDATE scheduled_sends
       SET scheduled_for = $2, job_id = $3
       WHERE message_id = $1 AND cancelled_at IS NULL
       RETURNING *`,
      [messageId, scheduledFor, jobId],
    );
    return rows[0] ?? null;
  }

  /** Marks a pending send cancelled; returns null if it was already cancelled or dispatched. */
  async cancel(messageId: string): Promise<ScheduledSendRow | null> {
    const { rows } = await this.pool.query<ScheduledSendRow>(
      `UPDATE scheduled_sends
       SET cancelled_at = now()
       WHERE message_id = $1 AND cancelled_at IS NULL
       RETURNING *`,
      [messageId],
    );
    return rows[0] ?? null;
  }

  async listUpcoming(): Promise<ScheduledSendListRow[]> {
    const { rows } = await this.pool.query<ScheduledSendListRow>(
      `SELECT s.*,
              m.to_email, m.to_name, m.subject,
              m.sender_account_id,
              sa.email AS sender_account_email,
              sa.display_name AS sender_account_display_name
       FROM scheduled_sends s
       JOIN email_messages m ON m.id = s.message_id
       JOIN sender_accounts sa ON sa.id = m.sender_account_id
       WHERE s.cancelled_at IS NULL AND m.status = 'scheduled'
       ORDER BY s.scheduled_for ASC`,
    );
    return rows;
  }
}
