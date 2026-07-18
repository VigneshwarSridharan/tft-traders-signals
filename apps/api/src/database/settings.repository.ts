import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './database.constants';
import type { SettingsRow } from './rows';

@Injectable()
export class SettingsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getByKey(key: string): Promise<SettingsRow | null> {
    const { rows } = await this.pool.query<SettingsRow>(
      `SELECT * FROM settings WHERE key = $1`,
      [key],
    );
    return rows[0] ?? null;
  }

  async getAll(): Promise<SettingsRow[]> {
    const { rows } = await this.pool.query<SettingsRow>(
      `SELECT * FROM settings`,
    );
    return rows;
  }

  async upsert(key: string, value: unknown): Promise<SettingsRow> {
    const { rows } = await this.pool.query<SettingsRow>(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
       RETURNING *`,
      [key, JSON.stringify(value)],
    );
    return rows[0];
  }
}
