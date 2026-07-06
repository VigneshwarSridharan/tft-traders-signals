import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './database.constants';
import type { SessionRow } from './rows';

export interface CreateSessionInput {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ip?: string | null;
}

@Injectable()
export class SessionsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: CreateSessionInput): Promise<SessionRow> {
    const { rows } = await this.pool.query<SessionRow>(
      `INSERT INTO sessions (user_id, refresh_token_hash, expires_at, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.userId,
        input.refreshTokenHash,
        input.expiresAt,
        input.userAgent ?? null,
        input.ip ?? null,
      ],
    );
    return rows[0];
  }

  async findValidByHash(refreshTokenHash: string): Promise<SessionRow | null> {
    const { rows } = await this.pool.query<SessionRow>(
      `SELECT * FROM sessions
       WHERE refresh_token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [refreshTokenHash],
    );
    return rows[0] ?? null;
  }

  async revokeById(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
      [id],
    );
  }

  async revokeByHash(refreshTokenHash: string): Promise<void> {
    await this.pool.query(
      `UPDATE sessions SET revoked_at = now() WHERE refresh_token_hash = $1 AND revoked_at IS NULL`,
      [refreshTokenHash],
    );
  }
}
