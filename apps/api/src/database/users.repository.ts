import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { NotificationPreferences, UserRole } from '@tft/shared';
import { PG_POOL } from './database.constants';
import type { UserRow } from './rows';

export interface CreateUserInput {
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
}

export interface UpdateUserInput {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
}

@Injectable()
export class UsersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<UserRow | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT * FROM users WHERE email = $1`,
      [email],
    );
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT * FROM users WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async list(): Promise<UserRow[]> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT * FROM users ORDER BY created_at ASC`,
    );
    return rows;
  }

  async create(input: CreateUserInput): Promise<UserRow> {
    const { rows } = await this.pool.query<UserRow>(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.email, input.name, input.passwordHash, input.role],
    );
    return rows[0];
  }

  async update(id: string, patch: UpdateUserInput): Promise<UserRow | null> {
    const { rows } = await this.pool.query<UserRow>(
      `UPDATE users
       SET name = COALESCE($2, name),
           role = COALESCE($3, role),
           is_active = COALESCE($4, is_active)
       WHERE id = $1
       RETURNING *`,
      [id, patch.name ?? null, patch.role ?? null, patch.isActive ?? null],
    );
    return rows[0] ?? null;
  }

  async updateNotificationPrefs(
    id: string,
    prefs: NotificationPreferences,
  ): Promise<UserRow | null> {
    const { rows } = await this.pool.query<UserRow>(
      `UPDATE users SET notification_prefs = $2 WHERE id = $1 RETURNING *`,
      [id, JSON.stringify(prefs)],
    );
    return rows[0] ?? null;
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE users SET last_login_at = now() WHERE id = $1`,
      [id],
    );
  }

  async countActiveAdmins(excludingUserId?: string): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM users
       WHERE role = 'admin' AND is_active = true AND id <> COALESCE($1, '00000000-0000-0000-0000-000000000000'::uuid)`,
      [excludingUserId ?? null],
    );
    return Number(rows[0]?.count ?? '0');
  }
}
