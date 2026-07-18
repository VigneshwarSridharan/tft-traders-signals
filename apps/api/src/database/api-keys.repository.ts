import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './database.constants';
import type { ApiKeyRow } from './rows';

export interface CreateApiKeyInput {
  userId: string;
  name: string;
  keyHash: string;
  scopes: string[];
  expiresAt: Date | null;
}

@Injectable()
export class ApiKeysRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: CreateApiKeyInput): Promise<ApiKeyRow> {
    const { rows } = await this.pool.query<ApiKeyRow>(
      `INSERT INTO api_keys (user_id, name, key_hash, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.userId, input.name, input.keyHash, input.scopes, input.expiresAt],
    );
    return rows[0];
  }

  async findByHash(keyHash: string): Promise<ApiKeyRow | null> {
    const { rows } = await this.pool.query<ApiKeyRow>(
      `SELECT * FROM api_keys WHERE key_hash = $1`,
      [keyHash],
    );
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<ApiKeyRow | null> {
    const { rows } = await this.pool.query<ApiKeyRow>(
      `SELECT * FROM api_keys WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async listForUser(userId: string): Promise<ApiKeyRow[]> {
    const { rows } = await this.pool.query<ApiKeyRow>(
      `SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return rows;
  }

  async listAll(): Promise<ApiKeyRow[]> {
    const { rows } = await this.pool.query<ApiKeyRow>(
      `SELECT * FROM api_keys ORDER BY created_at DESC`,
    );
    return rows;
  }

  async revoke(id: string): Promise<ApiKeyRow | null> {
    const { rows } = await this.pool.query<ApiKeyRow>(
      `UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING *`,
      [id],
    );
    return rows[0] ?? null;
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE api_keys SET last_used_at = now() WHERE id = $1`,
      [id],
    );
  }
}
