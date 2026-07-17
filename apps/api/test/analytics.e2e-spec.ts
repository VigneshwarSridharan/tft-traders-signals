import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { Pool } from 'pg';
import { App } from 'supertest/types';
import type {
  AnalyticsKpisResponse,
  AnalyticsTimeseriesResponse,
  CustomerSummary,
  EmailTemplateSummary,
  SenderAccountSummary,
  TemplateCategorySummary,
} from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';
import { PG_POOL } from './../src/database/database.constants';
import { StatsRollupService } from './../src/analytics/stats-rollup.service';

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function daysAgo(n: number): Date {
  const day = startOfUtcDay(new Date());
  day.setUTCDate(day.getUTCDate() - n);
  return day;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function atNoon(day: Date): Date {
  return new Date(day.getTime() + 12 * 60 * 60 * 1000);
}

describe('Analytics (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let pool: Pool;
  let statsRollupService: StatsRollupService;
  let adminCookies: string[];
  let senderAccount: SenderAccountSummary;
  let otherSenderAccount: SenderAccountSummary;
  let template: EmailTemplateSummary;
  let customerId: string;

  // Fixture spans 4 days: T-3, T-2 form the "previous" comparison period,
  // T-1, T form the "current" period queried in the tests below.
  const day = {
    t3: daysAgo(3),
    t2: daysAgo(2),
    t1: daysAgo(1),
    t0: daysAgo(0),
  };

  async function loginAsNewUser(role: 'admin' | 'agent'): Promise<string[]> {
    const email = `${role}-${randomUUID()}@example.com`;
    const password = 'TestPass123!';
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    await usersRepository.create({
      email,
      name: `Test ${role}`,
      passwordHash,
      role,
    });
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return loginResponse.get('Set-Cookie') ?? [];
  }

  async function insertMessage(params: {
    sentDay: Date;
    status: 'delivered' | 'bounced';
    bounceType?: 'hard' | 'soft';
    senderAccountId?: string;
    withTemplate?: boolean;
  }): Promise<string> {
    const token = randomUUID();
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO email_messages
         (public_token, sender_account_id, customer_id, template_version_id, to_email,
          message_id_header, status, bounce_type, sent_at, tracking_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       RETURNING id`,
      [
        token,
        params.senderAccountId ?? senderAccount.id,
        customerId,
        params.withTemplate === false
          ? null
          : (template.currentVersion?.id ?? null),
        `recipient-${token}@example.com`,
        `<${token}@test.local>`,
        params.status,
        params.bounceType ?? 'none',
        atNoon(params.sentDay),
      ],
    );
    return rows[0].id;
  }

  async function insertEvent(params: {
    messageId: string;
    day: Date;
    eventType: 'open' | 'click' | 'unsubscribe';
    isBot?: boolean;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO tracking_events
         (message_id, event_type, occurred_at, is_bot, is_proxy, metadata)
       VALUES ($1, $2, $3, $4, false, '{}')`,
      [
        params.messageId,
        params.eventType,
        atNoon(params.day),
        params.isBot ?? false,
      ],
    );
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    usersRepository = app.get(UsersRepository);
    pool = app.get<Pool>(PG_POOL);
    statsRollupService = app.get(StatsRollupService);

    adminCookies = await loginAsNewUser('admin');

    const senderResponse = await request(app.getHttpServer())
      .post('/sender-accounts')
      .set('Cookie', adminCookies)
      .send({
        email: `sales-${randomUUID()}@example.com`,
        appPassword: 'zoho-app-password',
        displayName: 'Sales Team',
      })
      .expect(201);
    senderAccount = senderResponse.body as SenderAccountSummary;

    const otherSenderResponse = await request(app.getHttpServer())
      .post('/sender-accounts')
      .set('Cookie', adminCookies)
      .send({
        email: `support-${randomUUID()}@example.com`,
        appPassword: 'zoho-app-password',
        displayName: 'Support Team',
      })
      .expect(201);
    otherSenderAccount = otherSenderResponse.body as SenderAccountSummary;

    const categoryResponse = await request(app.getHttpServer())
      .post('/template-categories')
      .set('Cookie', adminCookies)
      .send({ name: `Quotation ${randomUUID()}` })
      .expect(201);
    const category = categoryResponse.body as TemplateCategorySummary;

    const templateResponse = await request(app.getHttpServer())
      .post('/templates')
      .set('Cookie', adminCookies)
      .send({
        categoryId: category.id,
        name: `Quotation ${randomUUID()}`,
        subject: 'Your quote',
        bodyHtml: '<p>Hi</p>',
      })
      .expect(201);
    template = templateResponse.body as EmailTemplateSummary;

    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', adminCookies)
      .send({ name: 'Jane Doe', email: `jane-${randomUUID()}@example.com` })
      .expect(201);
    customerId = (customerResponse.body as CustomerSummary).id;

    // --- Previous period fixture: T-3, T-2 ---
    // T-3: 1 delivered (1 open), 1 bounced hard
    const t3Delivered = await insertMessage({
      sentDay: day.t3,
      status: 'delivered',
    });
    await insertMessage({
      sentDay: day.t3,
      status: 'bounced',
      bounceType: 'hard',
    });
    await insertEvent({
      messageId: t3Delivered,
      day: day.t3,
      eventType: 'open',
    });

    // T-2: 2 delivered, no bounce
    await insertMessage({ sentDay: day.t2, status: 'delivered' });
    await insertMessage({ sentDay: day.t2, status: 'delivered' });

    // --- Current period fixture: T-1, T0 ---
    // T-1: 3 delivered, 1 bounced hard, 1 bounced soft
    const t1DeliveredA = await insertMessage({
      sentDay: day.t1,
      status: 'delivered',
    });
    const t1DeliveredB = await insertMessage({
      sentDay: day.t1,
      status: 'delivered',
    });
    await insertMessage({ sentDay: day.t1, status: 'delivered' });
    await insertMessage({
      sentDay: day.t1,
      status: 'bounced',
      bounceType: 'hard',
    });
    await insertMessage({
      sentDay: day.t1,
      status: 'bounced',
      bounceType: 'soft',
    });
    // message A: 2 opens (1 unique message), 1 click
    await insertEvent({
      messageId: t1DeliveredA,
      day: day.t1,
      eventType: 'open',
    });
    await insertEvent({
      messageId: t1DeliveredA,
      day: day.t1,
      eventType: 'open',
    });
    await insertEvent({
      messageId: t1DeliveredA,
      day: day.t1,
      eventType: 'click',
    });
    // message B: 1 open, plus a bot open that must be excluded
    await insertEvent({
      messageId: t1DeliveredB,
      day: day.t1,
      eventType: 'open',
    });
    await insertEvent({
      messageId: t1DeliveredB,
      day: day.t1,
      eventType: 'open',
      isBot: true,
    });
    await insertEvent({
      messageId: t1DeliveredB,
      day: day.t1,
      eventType: 'unsubscribe',
    });

    // T0 (today): 4 delivered, 1 bounced hard; on a different sender account
    // to exercise the senderAccountId filter
    const t0DeliveredA = await insertMessage({
      sentDay: day.t0,
      status: 'delivered',
      senderAccountId: otherSenderAccount.id,
      withTemplate: false,
    });
    const t0DeliveredB = await insertMessage({
      sentDay: day.t0,
      status: 'delivered',
    });
    await insertMessage({ sentDay: day.t0, status: 'delivered' });
    await insertMessage({ sentDay: day.t0, status: 'delivered' });
    await insertMessage({
      sentDay: day.t0,
      status: 'bounced',
      bounceType: 'hard',
    });
    await insertEvent({
      messageId: t0DeliveredA,
      day: day.t0,
      eventType: 'open',
    });
    await insertEvent({
      messageId: t0DeliveredA,
      day: day.t0,
      eventType: 'click',
    });
    await insertEvent({
      messageId: t0DeliveredB,
      day: day.t0,
      eventType: 'open',
    });

    await statsRollupService.run(day.t3);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/analytics/kpis').expect(401);
    await request(app.getHttpServer()).get('/analytics/timeseries').expect(401);
  });

  it('reconciles KPI numbers exactly against a raw-event query for the period', async () => {
    const dateFrom = toDateOnly(day.t1);
    const dateTo = toDateOnly(day.t0);

    // Scoped to our own sender account: the e2e suite runs many other specs
    // against this same database that also send/track mail "today", so an
    // unfiltered (whole-table) comparison would be polluted by them. Scoping
    // both the raw query and the API call to our fixture's account keeps the
    // comparison exact while still exercising the same rollup/query paths.
    const { rows: rawCounts } = await pool.query<{
      sent: string;
      delivered: string;
      bounced_hard: string;
      bounced_soft: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('sent','delivered','bounced')) AS sent,
         COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
         COUNT(*) FILTER (WHERE status = 'bounced' AND bounce_type = 'hard') AS bounced_hard,
         COUNT(*) FILTER (WHERE status = 'bounced' AND bounce_type = 'soft') AS bounced_soft
       FROM email_messages
       WHERE sent_at::date BETWEEN $1 AND $2 AND sender_account_id = $3`,
      [dateFrom, dateTo, senderAccount.id],
    );
    const raw = rawCounts[0];

    const { rows: rawEventCounts } = await pool.query<{
      opens_total: string;
      opens_unique: string;
      clicks_total: string;
      clicks_unique: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE te.event_type = 'open') AS opens_total,
         COUNT(DISTINCT te.message_id) FILTER (WHERE te.event_type = 'open') AS opens_unique,
         COUNT(*) FILTER (WHERE te.event_type = 'click') AS clicks_total,
         COUNT(DISTINCT te.message_id) FILTER (WHERE te.event_type = 'click') AS clicks_unique
       FROM tracking_events te
       JOIN email_messages em ON em.id = te.message_id
       WHERE te.is_bot = false
         AND te.occurred_at::date BETWEEN $1 AND $2
         AND em.sender_account_id = $3`,
      [dateFrom, dateTo, senderAccount.id],
    );
    const rawEvents = rawEventCounts[0];

    const response = await request(app.getHttpServer())
      .get(
        `/analytics/kpis?dateFrom=${dateFrom}&dateTo=${dateTo}&senderAccountId=${senderAccount.id}`,
      )
      .set('Cookie', adminCookies)
      .expect(200);
    const body = response.body as AnalyticsKpisResponse;

    expect(body.current.sent).toBe(Number(raw.sent));
    expect(body.current.delivered).toBe(Number(raw.delivered));
    expect(body.current.bouncedHard).toBe(Number(raw.bounced_hard));
    expect(body.current.bouncedSoft).toBe(Number(raw.bounced_soft));
    expect(body.current.opensTotal).toBe(Number(rawEvents.opens_total));
    expect(body.current.opensUnique).toBe(Number(rawEvents.opens_unique));
    expect(body.current.clicksTotal).toBe(Number(rawEvents.clicks_total));
    expect(body.current.clicksUnique).toBe(Number(rawEvents.clicks_unique));

    // Fixture-derived expectations (see beforeAll), asserted independently
    // of the raw-count query above as a second reconciliation path. T0's
    // otherSenderAccount message is excluded by the senderAccountId filter.
    expect(body.current.sent).toBe(9);
    expect(body.current.delivered).toBe(6);
    expect(body.current.bouncedHard).toBe(2);
    expect(body.current.bouncedSoft).toBe(1);
    expect(body.current.opensTotal).toBe(4);
    expect(body.current.opensUnique).toBe(3);
    expect(body.current.clicksTotal).toBe(1);
    expect(body.current.clicksUnique).toBe(1);
    expect(body.current.unsubscribes).toBe(1);
    expect(body.current.deliveryRate).toBeCloseTo(6 / 9);
    expect(body.current.openRate).toBeCloseTo(3 / 6);
    expect(body.current.ctr).toBeCloseTo(1 / 6);
    expect(body.current.ctor).toBeCloseTo(1 / 3);
    expect(body.current.bounceRate).toBeCloseTo(3 / 9);

    expect(body.previous.sent).toBe(4);
    expect(body.previous.delivered).toBe(3);
    expect(body.previous.bouncedHard).toBe(1);
    expect(body.previous.opensTotal).toBe(1);
    expect(body.previous.opensUnique).toBe(1);

    expect(body.currentPeriod).toEqual({ dateFrom, dateTo });
    expect(body.previousPeriod).toEqual({
      dateFrom: toDateOnly(day.t3),
      dateTo: toDateOnly(day.t2),
    });

    expect(body.deltas.sent).toBeCloseTo(((9 - 4) / 4) * 100);
  });

  it('scopes KPI numbers to a single sender account via the senderAccountId filter', async () => {
    const dateFrom = toDateOnly(day.t0);
    const dateTo = toDateOnly(day.t0);

    const otherResponse = await request(app.getHttpServer())
      .get(
        `/analytics/kpis?dateFrom=${dateFrom}&dateTo=${dateTo}&senderAccountId=${otherSenderAccount.id}`,
      )
      .set('Cookie', adminCookies)
      .expect(200);
    const otherBody = otherResponse.body as AnalyticsKpisResponse;
    expect(otherBody.current.sent).toBe(1);
    expect(otherBody.current.delivered).toBe(1);
    expect(otherBody.current.opensTotal).toBe(1);
    expect(otherBody.current.clicksTotal).toBe(1);

    const mainResponse = await request(app.getHttpServer())
      .get(
        `/analytics/kpis?dateFrom=${dateFrom}&dateTo=${dateTo}&senderAccountId=${senderAccount.id}`,
      )
      .set('Cookie', adminCookies)
      .expect(200);
    const mainBody = mainResponse.body as AnalyticsKpisResponse;
    // Total T0 activity minus the other account's single message.
    expect(mainBody.current.sent).toBe(4);
    expect(mainBody.current.delivered).toBe(3);
  });

  it('scopes KPI numbers to a single template via the templateId filter', async () => {
    const dateFrom = toDateOnly(day.t0);
    const dateTo = toDateOnly(day.t0);

    const response = await request(app.getHttpServer())
      .get(
        `/analytics/kpis?dateFrom=${dateFrom}&dateTo=${dateTo}&templateId=${template.id}`,
      )
      .set('Cookie', adminCookies)
      .expect(200);
    const body = response.body as AnalyticsKpisResponse;
    // Every T0 message except the ad-hoc (no-template) one on the other account.
    expect(body.current.sent).toBe(4);
    expect(body.current.delivered).toBe(3);
  });

  it('returns a daily time series that sums to the same totals as the KPI endpoint', async () => {
    const dateFrom = toDateOnly(day.t1);
    const dateTo = toDateOnly(day.t0);

    const response = await request(app.getHttpServer())
      .get(
        `/analytics/timeseries?dateFrom=${dateFrom}&dateTo=${dateTo}&grain=day&senderAccountId=${senderAccount.id}`,
      )
      .set('Cookie', adminCookies)
      .expect(200);
    const points = response.body as AnalyticsTimeseriesResponse;

    expect(points).toHaveLength(2);
    expect(points[0].periodStart).toBe(dateFrom);
    expect(points[1].periodStart).toBe(dateTo);

    const totalSent = points.reduce((sum, p) => sum + p.sent, 0);
    const totalDelivered = points.reduce((sum, p) => sum + p.delivered, 0);
    const totalOpensUnique = points.reduce((sum, p) => sum + p.opensUnique, 0);

    expect(totalSent).toBe(9);
    expect(totalDelivered).toBe(6);
    expect(totalOpensUnique).toBe(3);
  });

  it('answers a year-spanning time series query quickly using the rollup table', async () => {
    const dateTo = toDateOnly(day.t0);
    const dateFrom = toDateOnly(daysAgo(365));

    const start = Date.now();
    const response = await request(app.getHttpServer())
      .get(
        `/analytics/timeseries?dateFrom=${dateFrom}&dateTo=${dateTo}&grain=month`,
      )
      .set('Cookie', adminCookies)
      .expect(200);
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThan(200);
    expect(
      (response.body as AnalyticsTimeseriesResponse).length,
    ).toBeGreaterThan(0);
  });
});
