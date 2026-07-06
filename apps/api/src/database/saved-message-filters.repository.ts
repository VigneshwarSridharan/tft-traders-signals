import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './database.constants';
import type { SavedMessageFilterRow } from './rows';

export interface CreateSavedMessageFilterInput {
  userId: string;
  name: string;
  filter: Record<string, unknown>;
}

@Injectable()
export class SavedMessageFiltersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listForUser(userId: string): Promise<SavedMessageFilterRow[]> {
    const { rows } = await this.pool.query<SavedMessageFilterRow>(
      `SELECT * FROM saved_message_filters WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId],
    );
    return rows;
  }

  async findById(id: string): Promise<SavedMessageFilterRow | null> {
    const { rows } = await this.pool.query<SavedMessageFilterRow>(
      `SELECT * FROM saved_message_filters WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreateSavedMessageFilterInput,
  ): Promise<SavedMessageFilterRow> {
    const { rows } = await this.pool.query<SavedMessageFilterRow>(
      `INSERT INTO saved_message_filters (user_id, name, filter)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.userId, input.name, JSON.stringify(input.filter)],
    );
    return rows[0];
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM saved_message_filters WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
  }
}
