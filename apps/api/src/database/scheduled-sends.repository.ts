import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './database.constants';
import type { Queryable } from './queryable';
import type { ScheduledSendRow } from './rows';

export interface CreateScheduledSendInput {
  messageId: string;
  scheduledFor: Date;
  timezone: string | null;
  jobId: string | null;
}

export interface ScheduledSendListRow {
  id: string;
  message_id: string;
  scheduled_for: Date;
  timezone: string | null;
  to_email: string;
  to_name: string | null;
  subject: string | null;
  sender_account_id: string;
  template_version_id: string | null;
  created_at: Date;
}

export interface ScheduledSendListFilter {
  page: number;
  pageSize: number;
  /** Restricts results to messages sent by this user — used to scope agents to their own sends. */
  sentBy?: string;
}

@Injectable()
export class ScheduledSendsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(
    input: CreateScheduledSendInput,
    executor: Queryable = this.pool,
  ): Promise<ScheduledSendRow> {
    const { rows } = await executor.query<ScheduledSendRow>(
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

  async updateJobId(id: string, jobId: string): Promise<void> {
    await this.pool.query(
      `UPDATE scheduled_sends SET job_id = $2 WHERE id = $1`,
      [id, jobId],
    );
  }

  async reschedule(
    id: string,
    scheduledFor: Date,
    timezone: string | null,
    jobId: string,
  ): Promise<ScheduledSendRow> {
    const { rows } = await this.pool.query<ScheduledSendRow>(
      `UPDATE scheduled_sends
       SET scheduled_for = $2, timezone = $3, job_id = $4
       WHERE id = $1
       RETURNING *`,
      [id, scheduledFor, timezone, jobId],
    );
    return rows[0];
  }

  async markCancelled(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE scheduled_sends SET cancelled_at = now() WHERE id = $1`,
      [id],
    );
  }

  async list(
    filter: ScheduledSendListFilter,
  ): Promise<{ rows: ScheduledSendListRow[]; total: number }> {
    const offset = (filter.page - 1) * filter.pageSize;
    const conditions = [`ss.cancelled_at IS NULL`, `em.status = 'scheduled'`];
    const params: unknown[] = [];
    if (filter.sentBy) {
      params.push(filter.sentBy);
      conditions.push(`em.sent_by = $${params.length}`);
    }
    const whereClause = conditions.join(' AND ');

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM scheduled_sends ss
       JOIN email_messages em ON em.id = ss.message_id
       WHERE ${whereClause}`,
      params,
    );

    const { rows } = await this.pool.query<ScheduledSendListRow>(
      `SELECT
         ss.id,
         ss.message_id,
         ss.scheduled_for,
         ss.timezone,
         em.to_email,
         em.to_name,
         em.subject,
         em.sender_account_id,
         em.template_version_id,
         ss.created_at
       FROM scheduled_sends ss
       JOIN email_messages em ON em.id = ss.message_id
       WHERE ${whereClause}
       ORDER BY ss.scheduled_for ASC, ss.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filter.pageSize, offset],
    );

    return { rows, total: Number(countResult.rows[0]?.count ?? '0') };
  }
}
