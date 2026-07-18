import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './database.constants';
import type { WebhookEndpointRow } from './rows';

export interface CreateWebhookEndpointInput {
  url: string;
  secretEnc: Buffer;
  events: string[];
}

export interface UpdateWebhookEndpointInput {
  url?: string;
  events?: string[];
}

@Injectable()
export class WebhookEndpointsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: CreateWebhookEndpointInput): Promise<WebhookEndpointRow> {
    const { rows } = await this.pool.query<WebhookEndpointRow>(
      `INSERT INTO webhook_endpoints (url, secret_enc, events)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.url, input.secretEnc, input.events],
    );
    return rows[0];
  }

  async list(): Promise<WebhookEndpointRow[]> {
    const { rows } = await this.pool.query<WebhookEndpointRow>(
      `SELECT * FROM webhook_endpoints ORDER BY created_at DESC`,
    );
    return rows;
  }

  async findById(id: string): Promise<WebhookEndpointRow | null> {
    const { rows } = await this.pool.query<WebhookEndpointRow>(
      `SELECT * FROM webhook_endpoints WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findActiveByEvent(eventType: string): Promise<WebhookEndpointRow[]> {
    const { rows } = await this.pool.query<WebhookEndpointRow>(
      `SELECT * FROM webhook_endpoints WHERE is_active AND $1 = ANY(events)`,
      [eventType],
    );
    return rows;
  }

  async update(
    id: string,
    patch: UpdateWebhookEndpointInput,
  ): Promise<WebhookEndpointRow | null> {
    const { rows } = await this.pool.query<WebhookEndpointRow>(
      `UPDATE webhook_endpoints
       SET url = COALESCE($2, url),
           events = COALESCE($3, events)
       WHERE id = $1
       RETURNING *`,
      [id, patch.url ?? null, patch.events ?? null],
    );
    return rows[0] ?? null;
  }

  async setActive(
    id: string,
    isActive: boolean,
  ): Promise<WebhookEndpointRow | null> {
    const { rows } = await this.pool.query<WebhookEndpointRow>(
      `UPDATE webhook_endpoints SET is_active = $2 WHERE id = $1 RETURNING *`,
      [id, isActive],
    );
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM webhook_endpoints WHERE id = $1`, [id]);
  }
}
