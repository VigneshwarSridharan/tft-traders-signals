import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { SenderAccountStatus } from '@tft/shared';
import { PG_POOL } from './database.constants';
import type { SenderAccountRow } from './rows';

export interface CreateSenderAccountInput {
  email: string;
  displayName: string | null;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
  credentialEnc: Buffer;
  signatureHtml: string | null;
  dailyQuota: number | null;
  hourlyQuota: number | null;
}

export interface UpdateSenderAccountInput {
  displayName?: string;
  smtpHost?: string;
  smtpPort?: number;
  imapHost?: string;
  imapPort?: number;
  credentialEnc?: Buffer;
  signatureHtml?: string;
  dailyQuota?: number | null;
  hourlyQuota?: number | null;
  status?: SenderAccountStatus;
}

export interface SenderAccountUsage {
  dailyUsed: number;
  hourlyUsed: number;
}

@Injectable()
export class SenderAccountsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(): Promise<SenderAccountRow[]> {
    const { rows } = await this.pool.query<SenderAccountRow>(
      `SELECT * FROM sender_accounts ORDER BY created_at ASC`,
    );
    return rows;
  }

  async findById(id: string): Promise<SenderAccountRow | null> {
    const { rows } = await this.pool.query<SenderAccountRow>(
      `SELECT * FROM sender_accounts WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<SenderAccountRow | null> {
    const { rows } = await this.pool.query<SenderAccountRow>(
      `SELECT * FROM sender_accounts WHERE email = $1`,
      [email],
    );
    return rows[0] ?? null;
  }

  async create(input: CreateSenderAccountInput): Promise<SenderAccountRow> {
    const { rows } = await this.pool.query<SenderAccountRow>(
      `INSERT INTO sender_accounts
         (email, display_name, smtp_host, smtp_port, imap_host, imap_port,
          credential_enc, signature_html, daily_quota, hourly_quota)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.email,
        input.displayName,
        input.smtpHost,
        input.smtpPort,
        input.imapHost,
        input.imapPort,
        input.credentialEnc,
        input.signatureHtml,
        input.dailyQuota,
        input.hourlyQuota,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    patch: UpdateSenderAccountInput,
  ): Promise<SenderAccountRow | null> {
    const { rows } = await this.pool.query<SenderAccountRow>(
      `UPDATE sender_accounts
       SET display_name = COALESCE($2, display_name),
           smtp_host = COALESCE($3, smtp_host),
           smtp_port = COALESCE($4, smtp_port),
           imap_host = COALESCE($5, imap_host),
           imap_port = COALESCE($6, imap_port),
           credential_enc = COALESCE($7, credential_enc),
           signature_html = COALESCE($8, signature_html),
           daily_quota = CASE WHEN $9 THEN $10 ELSE daily_quota END,
           hourly_quota = CASE WHEN $11 THEN $12 ELSE hourly_quota END,
           status = COALESCE($13, status)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        patch.displayName ?? null,
        patch.smtpHost ?? null,
        patch.smtpPort ?? null,
        patch.imapHost ?? null,
        patch.imapPort ?? null,
        patch.credentialEnc ?? null,
        patch.signatureHtml ?? null,
        'dailyQuota' in patch,
        patch.dailyQuota ?? null,
        'hourlyQuota' in patch,
        patch.hourlyQuota ?? null,
        patch.status ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  async setVerificationResult(
    id: string,
    status: SenderAccountStatus,
  ): Promise<SenderAccountRow | null> {
    const { rows } = await this.pool.query<SenderAccountRow>(
      `UPDATE sender_accounts
       SET status = $2, last_verified_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, status],
    );
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM sender_accounts WHERE id = $1`, [id]);
  }

  async countMessages(id: string): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM email_messages WHERE sender_account_id = $1`,
      [id],
    );
    return Number(rows[0]?.count ?? '0');
  }

  async getUsage(id: string): Promise<SenderAccountUsage> {
    const { rows } = await this.pool.query<{
      daily_used: string;
      hourly_used: string;
    }>(
      `SELECT
         count(*) FILTER (
           WHERE sent_at >= date_trunc('day', now())
         )::text AS daily_used,
         count(*) FILTER (
           WHERE sent_at >= date_trunc('hour', now())
         )::text AS hourly_used
       FROM email_messages
       WHERE sender_account_id = $1
         AND status IN ('sent', 'delivered')`,
      [id],
    );
    return {
      dailyUsed: Number(rows[0]?.daily_used ?? '0'),
      hourlyUsed: Number(rows[0]?.hourly_used ?? '0'),
    };
  }

  async getUsageForAll(): Promise<Map<string, SenderAccountUsage>> {
    const { rows } = await this.pool.query<{
      sender_account_id: string;
      daily_used: string;
      hourly_used: string;
    }>(
      `SELECT
         sender_account_id,
         count(*) FILTER (
           WHERE sent_at >= date_trunc('day', now())
         )::text AS daily_used,
         count(*) FILTER (
           WHERE sent_at >= date_trunc('hour', now())
         )::text AS hourly_used
       FROM email_messages
       WHERE status IN ('sent', 'delivered')
       GROUP BY sender_account_id`,
    );
    return new Map(
      rows.map((row) => [
        row.sender_account_id,
        {
          dailyUsed: Number(row.daily_used),
          hourlyUsed: Number(row.hourly_used),
        },
      ]),
    );
  }
}
