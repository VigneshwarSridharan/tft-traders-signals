import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './database.constants';
import type { WebhookDeliveryRow } from './rows';

export interface CreateWebhookDeliveryInput {
  endpointId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface ListWebhookDeliveriesOptions {
  page: number;
  pageSize: number;
}

@Injectable()
export class WebhookDeliveriesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: CreateWebhookDeliveryInput): Promise<WebhookDeliveryRow> {
    const { rows } = await this.pool.query<WebhookDeliveryRow>(
      `INSERT INTO webhook_deliveries (endpoint_id, event_type, payload, attempt)
       VALUES ($1, $2, $3, 1)
       RETURNING *`,
      [input.endpointId, input.eventType, JSON.stringify(input.payload)],
    );
    return rows[0];
  }

  async findById(id: string): Promise<WebhookDeliveryRow | null> {
    const { rows } = await this.pool.query<WebhookDeliveryRow>(
      `SELECT * FROM webhook_deliveries WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async markDelivered(
    id: string,
    responseStatus: number,
    deliveredAt: Date,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE webhook_deliveries
       SET response_status = $2, delivered_at = $3, next_retry_at = NULL
       WHERE id = $1`,
      [id, responseStatus, deliveredAt],
    );
  }

  async markRetrying(
    id: string,
    responseStatus: number | null,
    nextRetryAt: Date,
    attempt: number,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE webhook_deliveries
       SET response_status = $2, next_retry_at = $3, attempt = $4
       WHERE id = $1`,
      [id, responseStatus, nextRetryAt, attempt],
    );
  }

  /** Terminal failure — no further retries. `next_retry_at` stays/becomes null. */
  async markFailed(
    id: string,
    responseStatus: number | null,
    attempt: number,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE webhook_deliveries
       SET response_status = $2, attempt = $3, next_retry_at = NULL
       WHERE id = $1`,
      [id, responseStatus, attempt],
    );
  }

  async listForEndpoint(
    endpointId: string,
    options: ListWebhookDeliveriesOptions,
  ): Promise<{ rows: WebhookDeliveryRow[]; total: number }> {
    const offset = (options.page - 1) * options.pageSize;
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM webhook_deliveries WHERE endpoint_id = $1`,
      [endpointId],
    );
    const { rows } = await this.pool.query<WebhookDeliveryRow>(
      `SELECT * FROM webhook_deliveries
       WHERE endpoint_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [endpointId, options.pageSize, offset],
    );
    return { rows, total: Number(countResult.rows[0]?.count ?? '0') };
  }

  /**
   * Counts how many of the most-recent *terminal* deliveries (delivered, or
   * permanently failed — i.e. no longer awaiting a retry) for this endpoint
   * are failures, walking back from the newest until the first success or
   * until `limit` terminal deliveries have been examined. Used to decide
   * whether an endpoint has failed enough consecutive times to auto-disable.
   */
  async countRecentConsecutiveFailures(
    endpointId: string,
    limit: number,
  ): Promise<number> {
    // Terminal = a delivery attempt has actually completed (response_status
    // is only ever set once markDelivered/markRetrying/markFailed runs) and
    // it's not awaiting a retry — this excludes freshly-enqueued deliveries
    // that haven't been picked up by the worker yet, which would otherwise
    // look identical to a permanent failure (both delivered_at and
    // next_retry_at null).
    const { rows } = await this.pool.query<
      Pick<WebhookDeliveryRow, 'delivered_at'>
    >(
      `SELECT delivered_at FROM webhook_deliveries
       WHERE endpoint_id = $1 AND next_retry_at IS NULL AND response_status IS NOT NULL
       ORDER BY created_at DESC
       LIMIT $2`,
      [endpointId, limit],
    );

    let count = 0;
    for (const row of rows) {
      if (row.delivered_at !== null) {
        break;
      }
      count += 1;
    }
    return count;
  }
}
