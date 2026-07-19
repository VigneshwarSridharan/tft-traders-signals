import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './database.constants';
import type { ReportSubscriptionRow } from './rows';

export interface ReportSubscriptionWithSenderRow extends ReportSubscriptionRow {
  sender_account_email: string;
}

export interface CreateReportSubscriptionInput {
  createdBy: string;
  name: string;
  kind: ReportSubscriptionRow['kind'];
  format: ReportSubscriptionRow['format'];
  filterParams: Record<string, unknown>;
  cadence: ReportSubscriptionRow['cadence'];
  hourOfDay: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  recipientEmails: string[];
  senderAccountId: string;
  isActive: boolean;
  nextRunAt: Date;
}

export interface UpdateReportSubscriptionInput {
  name?: string;
  filterParams?: Record<string, unknown>;
  cadence?: ReportSubscriptionRow['cadence'];
  hourOfDay?: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  recipientEmails?: string[];
  senderAccountId?: string;
  isActive?: boolean;
  nextRunAt?: Date;
}

const SELECT_WITH_SENDER = `
  SELECT rs.*, sa.email AS sender_account_email
  FROM report_subscriptions rs
  JOIN sender_accounts sa ON sa.id = rs.sender_account_id
`;

@Injectable()
export class ReportSubscriptionsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(
    input: CreateReportSubscriptionInput,
  ): Promise<ReportSubscriptionWithSenderRow> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO report_subscriptions
         (created_by, name, kind, format, filter_params, cadence,
          hour_of_day, day_of_week, day_of_month, recipient_emails,
          sender_account_id, is_active, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        input.createdBy,
        input.name,
        input.kind,
        input.format,
        JSON.stringify(input.filterParams),
        input.cadence,
        input.hourOfDay,
        input.dayOfWeek,
        input.dayOfMonth,
        input.recipientEmails,
        input.senderAccountId,
        input.isActive,
        input.nextRunAt,
      ],
    );
    const created = await this.findById(rows[0].id);
    if (!created) {
      throw new Error('Failed to load report subscription after insert');
    }
    return created;
  }

  async list(createdBy?: string): Promise<ReportSubscriptionWithSenderRow[]> {
    if (createdBy) {
      const { rows } = await this.pool.query<ReportSubscriptionWithSenderRow>(
        `${SELECT_WITH_SENDER} WHERE rs.created_by = $1 ORDER BY rs.created_at DESC`,
        [createdBy],
      );
      return rows;
    }
    const { rows } = await this.pool.query<ReportSubscriptionWithSenderRow>(
      `${SELECT_WITH_SENDER} ORDER BY rs.created_at DESC`,
    );
    return rows;
  }

  async findById(id: string): Promise<ReportSubscriptionWithSenderRow | null> {
    const { rows } = await this.pool.query<ReportSubscriptionWithSenderRow>(
      `${SELECT_WITH_SENDER} WHERE rs.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async update(
    id: string,
    patch: UpdateReportSubscriptionInput,
  ): Promise<ReportSubscriptionWithSenderRow | null> {
    await this.pool.query(
      `UPDATE report_subscriptions SET
         name = COALESCE($2, name),
         filter_params = COALESCE($3, filter_params),
         cadence = COALESCE($4, cadence),
         hour_of_day = COALESCE($5, hour_of_day),
         day_of_week = COALESCE($6, day_of_week),
         day_of_month = COALESCE($7, day_of_month),
         recipient_emails = COALESCE($8, recipient_emails),
         sender_account_id = COALESCE($9, sender_account_id),
         is_active = COALESCE($10, is_active),
         next_run_at = COALESCE($11, next_run_at)
       WHERE id = $1`,
      [
        id,
        patch.name ?? null,
        patch.filterParams ? JSON.stringify(patch.filterParams) : null,
        patch.cadence ?? null,
        patch.hourOfDay ?? null,
        patch.dayOfWeek === undefined ? null : patch.dayOfWeek,
        patch.dayOfMonth === undefined ? null : patch.dayOfMonth,
        patch.recipientEmails ?? null,
        patch.senderAccountId ?? null,
        patch.isActive ?? null,
        patch.nextRunAt ?? null,
      ],
    );
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM report_subscriptions WHERE id = $1`, [
      id,
    ]);
  }

  /** Due subscriptions for the worker's hourly scan. */
  async findDue(now: Date): Promise<ReportSubscriptionWithSenderRow[]> {
    const { rows } = await this.pool.query<ReportSubscriptionWithSenderRow>(
      `${SELECT_WITH_SENDER}
       WHERE rs.is_active AND rs.next_run_at <= $1
       ORDER BY rs.next_run_at ASC`,
      [now],
    );
    return rows;
  }

  async recordRun(
    id: string,
    input: { ranAt: Date; nextRunAt: Date; error: string | null },
  ): Promise<void> {
    await this.pool.query(
      `UPDATE report_subscriptions
       SET last_run_at = $2, last_run_error = $3, next_run_at = $4
       WHERE id = $1`,
      [id, input.ranAt, input.error, input.nextRunAt],
    );
  }
}
