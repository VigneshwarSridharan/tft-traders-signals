import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { AnalyticsTimeseriesGrain } from '@tft/shared';
import { PG_POOL } from './database.constants';

export interface DailyStatsFilter {
  senderAccountId?: string;
  templateId?: string;
}

export interface DailyStatsAggregate {
  sent: number;
  delivered: number;
  bouncedHard: number;
  bouncedSoft: number;
  opensTotal: number;
  opensUnique: number;
  clicksTotal: number;
  clicksUnique: number;
  replies: number;
  unsubscribes: number;
}

export interface DailyStatsTimeseriesPoint {
  periodStart: Date;
  sent: number;
  delivered: number;
  opensTotal: number;
  opensUnique: number;
  clicksTotal: number;
  clicksUnique: number;
}

interface AggregateRow {
  sent: string;
  delivered: string;
  bounced_hard: string;
  bounced_soft: string;
  opens_total: string;
  opens_unique: string;
  clicks_total: string;
  clicks_unique: string;
  replies: string;
  unsubscribes: string;
}

/** `day` is a plain date column; comparing/binding as a YYYY-MM-DD string sidesteps any session-timezone ambiguity a JS Date parameter could introduce. */
function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A filter value selects that dimension's specific row; an absent one selects the NULL ("all") row for that dimension — never every row for it, which would double count. */
function pushDimensionConditions(
  filter: DailyStatsFilter,
  params: unknown[],
  conditions: string[],
): void {
  if (filter.senderAccountId) {
    params.push(filter.senderAccountId);
    conditions.push(`sender_account_id = $${params.length}`);
  } else {
    conditions.push('sender_account_id IS NULL');
  }
  if (filter.templateId) {
    params.push(filter.templateId);
    conditions.push(`template_id = $${params.length}`);
  } else {
    conditions.push('template_id IS NULL');
  }
}

@Injectable()
export class DailyStatsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Recomputes and upserts every daily_stats row (all 4 NULL-dimension
   * combinations) for `sinceDay`..`untilDay` inclusive, from the raw
   * email_messages + tracking_events tables in one set-based query.
   * Idempotent — safe to call repeatedly over an overlapping range, which is
   * how the rollup job self-corrects for late-arriving events.
   */
  async rollupRange(sinceDay: Date, untilDay: Date): Promise<number> {
    const { rowCount } = await this.pool.query(
      `
      WITH msg AS (
        SELECT
          em.sent_at::date AS day,
          em.sender_account_id,
          tv.template_id,
          em.status,
          em.bounce_type
        FROM email_messages em
        LEFT JOIN template_versions tv ON tv.id = em.template_version_id
        WHERE em.sent_at IS NOT NULL
          AND em.sent_at::date BETWEEN $1 AND $2
      ),
      msg_agg AS (
        SELECT
          day,
          sender_account_id,
          template_id,
          COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'bounced')) AS sent,
          COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
          COUNT(*) FILTER (WHERE status = 'bounced' AND bounce_type = 'hard') AS bounced_hard,
          COUNT(*) FILTER (WHERE status = 'bounced' AND bounce_type = 'soft') AS bounced_soft
        FROM msg
        GROUP BY GROUPING SETS (
          (day, sender_account_id, template_id),
          (day, sender_account_id),
          (day, template_id),
          (day)
        )
        -- Ad-hoc messages (no template) have a real NULL template_id; without
        -- this filter they'd produce a spurious "detail" row indistinguishable
        -- from the (day, sender_account_id) "all templates" rollup row, and
        -- both would try to upsert the same (day, account, NULL) key.
        HAVING GROUPING(template_id) = 1 OR template_id IS NOT NULL
      ),
      evt AS (
        SELECT
          te.occurred_at::date AS day,
          em.sender_account_id,
          tv.template_id,
          te.event_type,
          te.message_id
        FROM tracking_events te
        JOIN email_messages em ON em.id = te.message_id
        LEFT JOIN template_versions tv ON tv.id = em.template_version_id
        WHERE te.is_bot = false
          AND te.occurred_at::date BETWEEN $1 AND $2
      ),
      evt_agg AS (
        SELECT
          day,
          sender_account_id,
          template_id,
          COUNT(*) FILTER (WHERE event_type IN ('open', 'open_inferred')) AS opens_total,
          COUNT(DISTINCT message_id) FILTER (WHERE event_type IN ('open', 'open_inferred')) AS opens_unique,
          COUNT(*) FILTER (WHERE event_type = 'click') AS clicks_total,
          COUNT(DISTINCT message_id) FILTER (WHERE event_type = 'click') AS clicks_unique,
          -- Task 15 (reply tracking) isn't implemented yet, so tracking_events
          -- never has 'reply' rows today; this is here so replies start
          -- flowing through the rollup automatically once it lands.
          COUNT(*) FILTER (WHERE event_type = 'reply') AS replies,
          COUNT(*) FILTER (WHERE event_type = 'unsubscribe') AS unsubscribes
        FROM evt
        GROUP BY GROUPING SETS (
          (day, sender_account_id, template_id),
          (day, sender_account_id),
          (day, template_id),
          (day)
        )
        HAVING GROUPING(template_id) = 1 OR template_id IS NOT NULL
      ),
      combined AS (
        SELECT
          COALESCE(m.day, e.day) AS day,
          COALESCE(m.sender_account_id, e.sender_account_id) AS sender_account_id,
          COALESCE(m.template_id, e.template_id) AS template_id,
          COALESCE(m.sent, 0) AS sent,
          COALESCE(m.delivered, 0) AS delivered,
          COALESCE(m.bounced_hard, 0) AS bounced_hard,
          COALESCE(m.bounced_soft, 0) AS bounced_soft,
          COALESCE(e.opens_total, 0) AS opens_total,
          COALESCE(e.opens_unique, 0) AS opens_unique,
          COALESCE(e.clicks_total, 0) AS clicks_total,
          COALESCE(e.clicks_unique, 0) AS clicks_unique,
          COALESCE(e.replies, 0) AS replies,
          COALESCE(e.unsubscribes, 0) AS unsubscribes
        FROM msg_agg m
        FULL OUTER JOIN evt_agg e
          ON m.day = e.day
          AND m.sender_account_id IS NOT DISTINCT FROM e.sender_account_id
          AND m.template_id IS NOT DISTINCT FROM e.template_id
      )
      INSERT INTO daily_stats
        (day, sender_account_id, template_id, sent, delivered, bounced_hard, bounced_soft,
         opens_total, opens_unique, clicks_total, clicks_unique, replies, unsubscribes)
      SELECT
        day, sender_account_id, template_id, sent, delivered, bounced_hard, bounced_soft,
        opens_total, opens_unique, clicks_total, clicks_unique, replies, unsubscribes
      FROM combined
      ON CONFLICT (day, sender_account_id, template_id) DO UPDATE SET
        sent = EXCLUDED.sent,
        delivered = EXCLUDED.delivered,
        bounced_hard = EXCLUDED.bounced_hard,
        bounced_soft = EXCLUDED.bounced_soft,
        opens_total = EXCLUDED.opens_total,
        opens_unique = EXCLUDED.opens_unique,
        clicks_total = EXCLUDED.clicks_total,
        clicks_unique = EXCLUDED.clicks_unique,
        replies = EXCLUDED.replies,
        unsubscribes = EXCLUDED.unsubscribes,
        updated_at = now()
      `,
      [toDateOnly(sinceDay), toDateOnly(untilDay)],
    );
    return rowCount ?? 0;
  }

  /** Sums the single dimension-row combo matching `filter` (see pushDimensionConditions) over the date range. */
  async sumRange(
    dateFrom: Date,
    dateTo: Date,
    filter: DailyStatsFilter,
  ): Promise<DailyStatsAggregate> {
    const params: unknown[] = [toDateOnly(dateFrom), toDateOnly(dateTo)];
    const conditions = ['day BETWEEN $1 AND $2'];
    pushDimensionConditions(filter, params, conditions);

    const { rows } = await this.pool.query<AggregateRow>(
      `SELECT
         COALESCE(SUM(sent), 0)::bigint AS sent,
         COALESCE(SUM(delivered), 0)::bigint AS delivered,
         COALESCE(SUM(bounced_hard), 0)::bigint AS bounced_hard,
         COALESCE(SUM(bounced_soft), 0)::bigint AS bounced_soft,
         COALESCE(SUM(opens_total), 0)::bigint AS opens_total,
         COALESCE(SUM(opens_unique), 0)::bigint AS opens_unique,
         COALESCE(SUM(clicks_total), 0)::bigint AS clicks_total,
         COALESCE(SUM(clicks_unique), 0)::bigint AS clicks_unique,
         COALESCE(SUM(replies), 0)::bigint AS replies,
         COALESCE(SUM(unsubscribes), 0)::bigint AS unsubscribes
       FROM daily_stats
       WHERE ${conditions.join(' AND ')}`,
      params,
    );
    const row = rows[0];
    return {
      sent: Number(row.sent),
      delivered: Number(row.delivered),
      bouncedHard: Number(row.bounced_hard),
      bouncedSoft: Number(row.bounced_soft),
      opensTotal: Number(row.opens_total),
      opensUnique: Number(row.opens_unique),
      clicksTotal: Number(row.clicks_total),
      clicksUnique: Number(row.clicks_unique),
      replies: Number(row.replies),
      unsubscribes: Number(row.unsubscribes),
    };
  }

  /**
   * Buckets daily_stats by the requested grain. For week/month/year grains
   * this sums the already-per-day "unique" columns across days in the
   * bucket, which is an approximation (a message opened on two different
   * days within the same bucket counts as 2 unique opens there) — the
   * accepted tradeoff of aggregating from the daily rollup instead of
   * re-scanning raw tracking_events for every query.
   */
  async timeseries(
    dateFrom: Date,
    dateTo: Date,
    grain: AnalyticsTimeseriesGrain,
    filter: DailyStatsFilter,
  ): Promise<DailyStatsTimeseriesPoint[]> {
    const params: unknown[] = [toDateOnly(dateFrom), toDateOnly(dateTo)];
    const conditions = ['day BETWEEN $1 AND $2'];
    pushDimensionConditions(filter, params, conditions);
    params.push(grain);

    const { rows } = await this.pool.query<{
      period_start: Date;
      sent: string;
      delivered: string;
      opens_total: string;
      opens_unique: string;
      clicks_total: string;
      clicks_unique: string;
    }>(
      `SELECT
         date_trunc($${params.length}, day)::date AS period_start,
         COALESCE(SUM(sent), 0)::bigint AS sent,
         COALESCE(SUM(delivered), 0)::bigint AS delivered,
         COALESCE(SUM(opens_total), 0)::bigint AS opens_total,
         COALESCE(SUM(opens_unique), 0)::bigint AS opens_unique,
         COALESCE(SUM(clicks_total), 0)::bigint AS clicks_total,
         COALESCE(SUM(clicks_unique), 0)::bigint AS clicks_unique
       FROM daily_stats
       WHERE ${conditions.join(' AND ')}
       GROUP BY period_start
       ORDER BY period_start ASC`,
      params,
    );
    return rows.map((row) => ({
      periodStart: row.period_start,
      sent: Number(row.sent),
      delivered: Number(row.delivered),
      opensTotal: Number(row.opens_total),
      opensUnique: Number(row.opens_unique),
      clicksTotal: Number(row.clicks_total),
      clicksUnique: Number(row.clicks_unique),
    }));
  }
}
