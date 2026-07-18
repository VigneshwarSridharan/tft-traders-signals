import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { SuppressionReason } from '@tft/shared';
import { PG_POOL } from './database.constants';
import type { Queryable } from './queryable';
import type { SuppressionRow } from './rows';

export interface UpsertSuppressionInput {
  email: string;
  customerId: string | null;
  reason: SuppressionReason;
  sourceMessageId: string | null;
}

@Injectable()
export class SuppressionsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(): Promise<SuppressionRow[]> {
    const { rows } = await this.pool.query<SuppressionRow>(
      `SELECT * FROM suppressions ORDER BY suppressed_at DESC`,
    );
    return rows;
  }

  async findByEmail(email: string): Promise<SuppressionRow | null> {
    const { rows } = await this.pool.query<SuppressionRow>(
      `SELECT * FROM suppressions WHERE email = $1`,
      [email],
    );
    return rows[0] ?? null;
  }

  /**
   * Re-suppresses on conflict — including reviving a previously released
   * entry — since a fresh bounce/unsubscribe always takes precedence over a
   * stale released state.
   */
  async upsert(
    input: UpsertSuppressionInput,
    executor: Queryable = this.pool,
  ): Promise<SuppressionRow> {
    const { rows } = await executor.query<SuppressionRow>(
      `INSERT INTO suppressions (email, customer_id, reason, source_message_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
       SET reason = EXCLUDED.reason,
           customer_id = COALESCE(EXCLUDED.customer_id, suppressions.customer_id),
           source_message_id = EXCLUDED.source_message_id,
           suppressed_at = now(),
           released_at = NULL,
           released_by = NULL
       RETURNING *`,
      [input.email, input.customerId, input.reason, input.sourceMessageId],
    );
    return rows[0];
  }

  async release(
    id: string,
    releasedBy: string,
  ): Promise<SuppressionRow | null> {
    const { rows } = await this.pool.query<SuppressionRow>(
      `UPDATE suppressions
       SET released_at = now(), released_by = $2
       WHERE id = $1 AND released_at IS NULL
       RETURNING *`,
      [id, releasedBy],
    );
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<SuppressionRow | null> {
    const { rows } = await this.pool.query<SuppressionRow>(
      `SELECT * FROM suppressions WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** GDPR erasure: the suppression entry survives (the address must stay blocked) but loses its link to the deleted customer row. */
  async clearCustomerId(
    customerId: string,
    executor: Queryable = this.pool,
  ): Promise<void> {
    await executor.query(
      `UPDATE suppressions SET customer_id = NULL WHERE customer_id = $1`,
      [customerId],
    );
  }
}
