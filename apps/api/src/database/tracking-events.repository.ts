import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { TrackingEventType } from '@tft/shared';
import { PG_POOL } from './database.constants';
import type { Queryable } from './queryable';
import type { TrackingEventRow } from './rows';

export interface CreateTrackingEventInput {
  messageId: string;
  linkId: string | null;
  eventType: TrackingEventType;
  occurredAt: Date;
  ip: string | null;
  userAgent: string | null;
  deviceType: string | null;
  os: string | null;
  browser: string | null;
  geoCountry: string | null;
  geoCity: string | null;
  isBot: boolean;
  isProxy: boolean;
  metadata: Record<string, unknown>;
}

/** Postgres NOTIFY channel used to push real-time tracking events to the api process (see RealtimeModule). */
export const TRACKING_EVENTS_CHANNEL = 'tracking_events';

@Injectable()
export class TrackingEventsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async insert(
    input: CreateTrackingEventInput,
    executor: Queryable = this.pool,
  ): Promise<TrackingEventRow> {
    const { rows } = await executor.query<TrackingEventRow>(
      `INSERT INTO tracking_events
         (message_id, link_id, event_type, occurred_at, ip, user_agent, device_type,
          os, browser, geo_country, geo_city, is_bot, is_proxy, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        input.messageId,
        input.linkId,
        input.eventType,
        input.occurredAt,
        input.ip,
        input.userAgent,
        input.deviceType,
        input.os,
        input.browser,
        input.geoCountry,
        input.geoCity,
        input.isBot,
        input.isProxy,
        JSON.stringify(input.metadata),
      ],
    );
    const event = rows[0];

    if (!input.isBot) {
      // Postgres defers NOTIFY delivery until COMMIT, so a rolled-back
      // transaction never reaches realtime subscribers — no separate
      // outbox/rollback handling needed.
      await executor.query(`SELECT pg_notify($1, $2)`, [
        TRACKING_EVENTS_CHANNEL,
        JSON.stringify({
          eventId: event.id,
          messageId: event.message_id,
          eventType: event.event_type,
          occurredAt: event.occurred_at.toISOString(),
        }),
      ]);
    }

    return event;
  }

  async listForMessage(
    messageId: string,
    includeBotEvents: boolean,
  ): Promise<TrackingEventRow[]> {
    const conditions = ['message_id = $1'];
    const params: unknown[] = [messageId];
    if (!includeBotEvents) {
      conditions.push('is_bot = false');
    }
    const { rows } = await this.pool.query<TrackingEventRow>(
      `SELECT * FROM tracking_events
       WHERE ${conditions.join(' AND ')}
       ORDER BY occurred_at ASC`,
      params,
    );
    return rows;
  }

  /** Distinct links clicked on this message within `windowMs` before `before` — feeds the "all links clicked instantly" bot heuristic. */
  async countRecentDistinctLinkClicks(
    messageId: string,
    before: Date,
    windowMs: number,
  ): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT link_id) AS count
       FROM tracking_events
       WHERE message_id = $1
         AND event_type = 'click'
         AND occurred_at BETWEEN $2 AND $3`,
      [messageId, new Date(before.getTime() - windowMs), before],
    );
    return Number(rows[0]?.count ?? 0);
  }
}
