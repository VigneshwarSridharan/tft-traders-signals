import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { UserRole } from '@tft/shared';
import { PG_POOL } from './database.constants';
import type { InvitationRow } from './rows';

export interface CreateInvitationInput {
  email: string;
  name: string;
  role: UserRole;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
}

@Injectable()
export class InvitationsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: CreateInvitationInput): Promise<InvitationRow> {
    const { rows } = await this.pool.query<InvitationRow>(
      `INSERT INTO invitations (email, name, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.email,
        input.name,
        input.role,
        input.tokenHash,
        input.invitedBy,
        input.expiresAt,
      ],
    );
    return rows[0];
  }

  async findValidByTokenHash(tokenHash: string): Promise<InvitationRow | null> {
    const { rows } = await this.pool.query<InvitationRow>(
      `SELECT * FROM invitations
       WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`,
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  async findPendingByEmail(email: string): Promise<InvitationRow | null> {
    const { rows } = await this.pool.query<InvitationRow>(
      `SELECT * FROM invitations
       WHERE email = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`,
      [email],
    );
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<InvitationRow | null> {
    const { rows } = await this.pool.query<InvitationRow>(
      `SELECT * FROM invitations WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async listPending(): Promise<InvitationRow[]> {
    const { rows } = await this.pool.query<InvitationRow>(
      `SELECT * FROM invitations
       WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC`,
    );
    return rows;
  }

  async markAccepted(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE invitations SET accepted_at = now() WHERE id = $1`,
      [id],
    );
  }

  async revoke(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE invitations SET revoked_at = now() WHERE id = $1 AND accepted_at IS NULL`,
      [id],
    );
  }
}
