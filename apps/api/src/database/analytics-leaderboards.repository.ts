import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './database.constants';

export interface LeaderboardFilter {
  senderAccountId?: string;
  templateId?: string;
}

export interface TemplateLeaderboardRow {
  templateId: string;
  templateName: string;
  categoryName: string;
  sent: number;
  delivered: number;
  opensUnique: number;
  clicksUnique: number;
}

export interface AccountLeaderboardRow {
  senderAccountId: string;
  senderAccountEmail: string;
  senderAccountDisplayName: string | null;
  sent: number;
  delivered: number;
  opensUnique: number;
  clicksUnique: number;
}

export interface TopEmailRow {
  messageId: string;
  subject: string | null;
  toEmail: string;
  toName: string | null;
  sentAt: Date | null;
  templateName: string | null;
  senderAccountEmail: string;
  senderAccountDisplayName: string | null;
  openCount: number;
  clickCount: number;
}

export interface TopLinkRow {
  originalUrl: string;
  linkLabel: string | null;
  totalClicks: number;
  timesSent: number;
}

export interface TopCustomerRow {
  customerId: string;
  name: string;
  email: string;
  company: string | null;
  sent: number;
  opensTotal: number;
  clicksTotal: number;
  messagesOpened: number;
  messagesClicked: number;
}

export interface HeatmapRow {
  weekday: number;
  hour: number;
  opens: number;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class AnalyticsLeaderboardsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async topTemplates(
    dateFrom: Date,
    dateTo: Date,
    filter: LeaderboardFilter,
    limit: number,
  ): Promise<TemplateLeaderboardRow[]> {
    const params: unknown[] = [toDateOnly(dateFrom), toDateOnly(dateTo)];
    const conditions = [
      'ds.day BETWEEN $1 AND $2',
      'ds.template_id IS NOT NULL',
    ];
    if (filter.senderAccountId) {
      params.push(filter.senderAccountId);
      conditions.push(`ds.sender_account_id = $${params.length}`);
    } else {
      conditions.push('ds.sender_account_id IS NULL');
    }
    params.push(limit);

    const { rows } = await this.pool.query<{
      template_id: string;
      template_name: string;
      category_name: string;
      sent: string;
      delivered: string;
      opens_unique: string;
      clicks_unique: string;
    }>(
      `SELECT
         ds.template_id,
         et.name AS template_name,
         tc.name AS category_name,
         COALESCE(SUM(ds.sent), 0)::bigint AS sent,
         COALESCE(SUM(ds.delivered), 0)::bigint AS delivered,
         COALESCE(SUM(ds.opens_unique), 0)::bigint AS opens_unique,
         COALESCE(SUM(ds.clicks_unique), 0)::bigint AS clicks_unique
       FROM daily_stats ds
       JOIN email_templates et ON et.id = ds.template_id
       JOIN template_categories tc ON tc.id = et.category_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY ds.template_id, et.name, tc.name
       HAVING COALESCE(SUM(ds.delivered), 0) > 0
       ORDER BY (SUM(ds.opens_unique)::float / NULLIF(SUM(ds.delivered), 0)) DESC, sent DESC
       LIMIT $${params.length}`,
      params,
    );

    return rows.map((row) => ({
      templateId: row.template_id,
      templateName: row.template_name,
      categoryName: row.category_name,
      sent: Number(row.sent),
      delivered: Number(row.delivered),
      opensUnique: Number(row.opens_unique),
      clicksUnique: Number(row.clicks_unique),
    }));
  }

  async topAccounts(
    dateFrom: Date,
    dateTo: Date,
    filter: LeaderboardFilter,
    limit: number,
  ): Promise<AccountLeaderboardRow[]> {
    const params: unknown[] = [toDateOnly(dateFrom), toDateOnly(dateTo)];
    const conditions = [
      'ds.day BETWEEN $1 AND $2',
      'ds.sender_account_id IS NOT NULL',
    ];
    if (filter.templateId) {
      params.push(filter.templateId);
      conditions.push(`ds.template_id = $${params.length}`);
    } else {
      conditions.push('ds.template_id IS NULL');
    }
    params.push(limit);

    const { rows } = await this.pool.query<{
      sender_account_id: string;
      sender_account_email: string;
      sender_account_display_name: string | null;
      sent: string;
      delivered: string;
      opens_unique: string;
      clicks_unique: string;
    }>(
      `SELECT
         ds.sender_account_id,
         sa.email AS sender_account_email,
         sa.display_name AS sender_account_display_name,
         COALESCE(SUM(ds.sent), 0)::bigint AS sent,
         COALESCE(SUM(ds.delivered), 0)::bigint AS delivered,
         COALESCE(SUM(ds.opens_unique), 0)::bigint AS opens_unique,
         COALESCE(SUM(ds.clicks_unique), 0)::bigint AS clicks_unique
       FROM daily_stats ds
       JOIN sender_accounts sa ON sa.id = ds.sender_account_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY ds.sender_account_id, sa.email, sa.display_name
       ORDER BY sent DESC
       LIMIT $${params.length}`,
      params,
    );

    return rows.map((row) => ({
      senderAccountId: row.sender_account_id,
      senderAccountEmail: row.sender_account_email,
      senderAccountDisplayName: row.sender_account_display_name,
      sent: Number(row.sent),
      delivered: Number(row.delivered),
      opensUnique: Number(row.opens_unique),
      clicksUnique: Number(row.clicks_unique),
    }));
  }

  async topEmails(
    dateFrom: Date,
    dateTo: Date,
    filter: LeaderboardFilter,
    limit: number,
  ): Promise<TopEmailRow[]> {
    const params: unknown[] = [toDateOnly(dateFrom), toDateOnly(dateTo)];
    const conditions = ['em.sent_at::date BETWEEN $1 AND $2'];
    if (filter.senderAccountId) {
      params.push(filter.senderAccountId);
      conditions.push(`em.sender_account_id = $${params.length}`);
    }
    if (filter.templateId) {
      params.push(filter.templateId);
      conditions.push(`tv.template_id = $${params.length}`);
    }
    params.push(limit);

    const { rows } = await this.pool.query<{
      message_id: string;
      subject: string | null;
      to_email: string;
      to_name: string | null;
      sent_at: Date | null;
      template_name: string | null;
      sender_account_email: string;
      sender_account_display_name: string | null;
      open_count: string;
      click_count: string;
    }>(
      `SELECT
         em.id AS message_id,
         em.subject,
         em.to_email,
         em.to_name,
         em.sent_at,
         et.name AS template_name,
         sa.email AS sender_account_email,
         sa.display_name AS sender_account_display_name,
         COUNT(te.id) FILTER (WHERE te.event_type IN ('open', 'open_inferred') AND te.is_bot = false)::bigint AS open_count,
         COUNT(te.id) FILTER (WHERE te.event_type = 'click' AND te.is_bot = false)::bigint AS click_count
       FROM email_messages em
       JOIN sender_accounts sa ON sa.id = em.sender_account_id
       LEFT JOIN template_versions tv ON tv.id = em.template_version_id
       LEFT JOIN email_templates et ON et.id = tv.template_id
       LEFT JOIN tracking_events te ON te.message_id = em.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY em.id, em.subject, em.to_email, em.to_name, em.sent_at, et.name, sa.email, sa.display_name
       HAVING COUNT(te.id) FILTER (WHERE te.event_type IN ('open', 'open_inferred') AND te.is_bot = false) > 0
       ORDER BY open_count DESC, click_count DESC
       LIMIT $${params.length}`,
      params,
    );

    return rows.map((row) => ({
      messageId: row.message_id,
      subject: row.subject,
      toEmail: row.to_email,
      toName: row.to_name,
      sentAt: row.sent_at,
      templateName: row.template_name,
      senderAccountEmail: row.sender_account_email,
      senderAccountDisplayName: row.sender_account_display_name,
      openCount: Number(row.open_count),
      clickCount: Number(row.click_count),
    }));
  }

  async topLinks(
    dateFrom: Date,
    dateTo: Date,
    filter: LeaderboardFilter,
    limit: number,
  ): Promise<TopLinkRow[]> {
    const params: unknown[] = [toDateOnly(dateFrom), toDateOnly(dateTo)];
    const conditions = ['em.sent_at::date BETWEEN $1 AND $2'];
    if (filter.senderAccountId) {
      params.push(filter.senderAccountId);
      conditions.push(`em.sender_account_id = $${params.length}`);
    }
    if (filter.templateId) {
      params.push(filter.templateId);
      conditions.push(`tv.template_id = $${params.length}`);
    }
    params.push(limit);

    const { rows } = await this.pool.query<{
      original_url: string;
      link_label: string | null;
      total_clicks: string;
      times_sent: string;
    }>(
      `SELECT
         el.original_url,
         MAX(el.link_label) AS link_label,
         COUNT(te.id) FILTER (WHERE te.event_type = 'click' AND te.is_bot = false)::bigint AS total_clicks,
         COUNT(DISTINCT el.id)::bigint AS times_sent
       FROM email_links el
       JOIN email_messages em ON em.id = el.message_id
       LEFT JOIN template_versions tv ON tv.id = em.template_version_id
       LEFT JOIN tracking_events te ON te.link_id = el.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY el.original_url
       HAVING COUNT(te.id) FILTER (WHERE te.event_type = 'click' AND te.is_bot = false) > 0
       ORDER BY total_clicks DESC
       LIMIT $${params.length}`,
      params,
    );

    return rows.map((row) => ({
      originalUrl: row.original_url,
      linkLabel: row.link_label,
      totalClicks: Number(row.total_clicks),
      timesSent: Number(row.times_sent),
    }));
  }

  async topCustomers(
    dateFrom: Date,
    dateTo: Date,
    filter: LeaderboardFilter,
    limit: number,
  ): Promise<TopCustomerRow[]> {
    const params: unknown[] = [toDateOnly(dateFrom), toDateOnly(dateTo)];
    const conditions = ['em.sent_at::date BETWEEN $1 AND $2'];
    if (filter.senderAccountId) {
      params.push(filter.senderAccountId);
      conditions.push(`em.sender_account_id = $${params.length}`);
    }
    if (filter.templateId) {
      params.push(filter.templateId);
      conditions.push(`tv.template_id = $${params.length}`);
    }
    params.push(limit);

    const { rows } = await this.pool.query<{
      customer_id: string;
      name: string;
      email: string;
      company: string | null;
      sent: string;
      opens_total: string;
      clicks_total: string;
      messages_opened: string;
      messages_clicked: string;
    }>(
      `SELECT
         c.id AS customer_id,
         c.name,
         c.email,
         c.company,
         COUNT(DISTINCT em.id)::bigint AS sent,
         COUNT(te.id) FILTER (WHERE te.event_type IN ('open', 'open_inferred') AND te.is_bot = false)::bigint AS opens_total,
         COUNT(te.id) FILTER (WHERE te.event_type = 'click' AND te.is_bot = false)::bigint AS clicks_total,
         COUNT(DISTINCT te.message_id) FILTER (WHERE te.event_type IN ('open', 'open_inferred') AND te.is_bot = false)::bigint AS messages_opened,
         COUNT(DISTINCT te.message_id) FILTER (WHERE te.event_type = 'click' AND te.is_bot = false)::bigint AS messages_clicked
       FROM email_messages em
       JOIN customers c ON c.id = em.customer_id
       LEFT JOIN template_versions tv ON tv.id = em.template_version_id
       LEFT JOIN tracking_events te ON te.message_id = em.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY c.id, c.name, c.email, c.company
       HAVING COUNT(te.id) FILTER (WHERE te.event_type IN ('open', 'open_inferred') AND te.is_bot = false)
            + COUNT(te.id) FILTER (WHERE te.event_type = 'click' AND te.is_bot = false) > 0
       ORDER BY (COUNT(te.id) FILTER (WHERE te.event_type IN ('open', 'open_inferred') AND te.is_bot = false)
            + COUNT(te.id) FILTER (WHERE te.event_type = 'click' AND te.is_bot = false) * 2) DESC
       LIMIT $${params.length}`,
      params,
    );

    return rows.map((row) => ({
      customerId: row.customer_id,
      name: row.name,
      email: row.email,
      company: row.company,
      sent: Number(row.sent),
      opensTotal: Number(row.opens_total),
      clicksTotal: Number(row.clicks_total),
      messagesOpened: Number(row.messages_opened),
      messagesClicked: Number(row.messages_clicked),
    }));
  }

  async heatmap(
    dateFrom: Date,
    dateTo: Date,
    filter: LeaderboardFilter,
  ): Promise<HeatmapRow[]> {
    const params: unknown[] = [toDateOnly(dateFrom), toDateOnly(dateTo)];
    const conditions = [
      "te.event_type IN ('open', 'open_inferred')",
      'te.is_bot = false',
      'te.occurred_at::date BETWEEN $1 AND $2',
    ];
    if (filter.senderAccountId) {
      params.push(filter.senderAccountId);
      conditions.push(`em.sender_account_id = $${params.length}`);
    }
    if (filter.templateId) {
      params.push(filter.templateId);
      conditions.push(`tv.template_id = $${params.length}`);
    }

    const { rows } = await this.pool.query<{
      weekday: number;
      hour: number;
      opens: string;
    }>(
      `SELECT
         EXTRACT(DOW FROM (te.occurred_at AT TIME ZONE 'UTC'))::int AS weekday,
         EXTRACT(HOUR FROM (te.occurred_at AT TIME ZONE 'UTC'))::int AS hour,
         COUNT(*)::bigint AS opens
       FROM tracking_events te
       JOIN email_messages em ON em.id = te.message_id
       LEFT JOIN template_versions tv ON tv.id = em.template_version_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY weekday, hour
       ORDER BY weekday, hour`,
      params,
    );

    return rows.map((row) => ({
      weekday: Number(row.weekday),
      hour: Number(row.hour),
      opens: Number(row.opens),
    }));
  }
}
