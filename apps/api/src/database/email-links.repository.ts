import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './database.constants';
import type { Queryable } from './queryable';
import type { EmailLinkRow } from './rows';

export interface CreateEmailLinkInput {
  messageId: string;
  token: string;
  originalUrl: string;
  linkLabel: string | null;
  position: number | null;
}

@Injectable()
export class EmailLinksRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(
    input: CreateEmailLinkInput,
    executor: Queryable = this.pool,
  ): Promise<EmailLinkRow> {
    const { rows } = await executor.query<EmailLinkRow>(
      `INSERT INTO email_links (message_id, token, original_url, link_label, position)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.messageId,
        input.token,
        input.originalUrl,
        input.linkLabel,
        input.position,
      ],
    );
    return rows[0];
  }

  async findByToken(token: string): Promise<EmailLinkRow | null> {
    const { rows } = await this.pool.query<EmailLinkRow>(
      `SELECT * FROM email_links WHERE token = $1`,
      [token],
    );
    return rows[0] ?? null;
  }

  async recordClick(
    id: string,
    executor: Queryable = this.pool,
  ): Promise<void> {
    await executor.query(
      `UPDATE email_links SET click_count = click_count + 1 WHERE id = $1`,
      [id],
    );
  }
}
