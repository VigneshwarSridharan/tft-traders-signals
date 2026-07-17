import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { Pool } from 'pg';
import { App } from 'supertest/types';
import type {
  AccountLeaderboardResponse,
  CustomerSummary,
  EmailTemplateSummary,
  SendTimeHeatmapResponse,
  SenderAccountSummary,
  TemplateCategorySummary,
  TemplateLeaderboardResponse,
  TopCustomersResponse,
  TopEmailsResponse,
  TopLinksResponse,
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

describe('Analytics leaderboards, comparisons & heatmap (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let pool: Pool;
  let statsRollupService: StatsRollupService;
  let adminCookies: string[];

  let strongTemplate: EmailTemplateSummary;
  let weakTemplate: EmailTemplateSummary;
  let strongCustomer: CustomerSummary;
  let weakCustomer: CustomerSummary;
  let senderAccount: SenderAccountSummary;

  const today = daysAgo(0);
  const dateFrom = toDateOnly(today);
  const dateTo = toDateOnly(today);
  const heatmapWeekday = atNoon(today).getUTCDay();

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
    templateVersionId: string | null;
    customerId: string;
    subject: string;
  }): Promise<string> {
    const token = randomUUID();
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO email_messages
         (public_token, sender_account_id, customer_id, template_version_id, to_email,
          message_id_header, subject, status, bounce_type, sent_at, tracking_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'delivered', 'none', $8, true)
       RETURNING id`,
      [
        token,
        senderAccount.id,
        params.customerId,
        params.templateVersionId,
        `recipient-${token}@example.com`,
        `<${token}@test.local>`,
        params.subject,
        atNoon(today),
      ],
    );
    return rows[0].id;
  }

  async function insertEvent(params: {
    messageId: string;
    linkId?: string;
    eventType: 'open' | 'click';
    isBot?: boolean;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO tracking_events
         (message_id, link_id, event_type, occurred_at, is_bot, is_proxy, metadata)
       VALUES ($1, $2, $3, $4, $5, false, '{}')`,
      [
        params.messageId,
        params.linkId ?? null,
        params.eventType,
        atNoon(today),
        params.isBot ?? false,
      ],
    );
  }

  async function insertLink(params: {
    messageId: string;
    originalUrl: string;
    linkLabel: string | null;
  }): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO email_links (message_id, token, original_url, link_label)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [params.messageId, randomUUID(), params.originalUrl, params.linkLabel],
    );
    return rows[0].id;
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
        email: `leaderboard-${randomUUID()}@example.com`,
        appPassword: 'zoho-app-password',
        displayName: 'Leaderboard Sender',
      })
      .expect(201);
    senderAccount = senderResponse.body as SenderAccountSummary;

    const categoryResponse = await request(app.getHttpServer())
      .post('/template-categories')
      .set('Cookie', adminCookies)
      .send({ name: `Leaderboard ${randomUUID()}` })
      .expect(201);
    const category = categoryResponse.body as TemplateCategorySummary;

    const strongTemplateResponse = await request(app.getHttpServer())
      .post('/templates')
      .set('Cookie', adminCookies)
      .send({
        categoryId: category.id,
        name: `Strong Template ${randomUUID()}`,
        subject: 'Strong',
        bodyHtml: '<p>Hi</p>',
      })
      .expect(201);
    strongTemplate = strongTemplateResponse.body as EmailTemplateSummary;

    const weakTemplateResponse = await request(app.getHttpServer())
      .post('/templates')
      .set('Cookie', adminCookies)
      .send({
        categoryId: category.id,
        name: `Weak Template ${randomUUID()}`,
        subject: 'Weak',
        bodyHtml: '<p>Hi</p>',
      })
      .expect(201);
    weakTemplate = weakTemplateResponse.body as EmailTemplateSummary;

    const strongCustomerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', adminCookies)
      .send({
        name: 'Engaged Erin',
        email: `erin-${randomUUID()}@example.com`,
        company: 'Acme Corp',
      })
      .expect(201);
    strongCustomer = strongCustomerResponse.body as CustomerSummary;

    const weakCustomerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', adminCookies)
      .send({
        name: 'Quiet Quinn',
        email: `quinn-${randomUUID()}@example.com`,
      })
      .expect(201);
    weakCustomer = weakCustomerResponse.body as CustomerSummary;

    // --- Strong template: 2 delivered, both opened (openRate 1.0) ---
    const strongMsgA = await insertMessage({
      templateVersionId: strongTemplate.currentVersion?.id ?? null,
      customerId: strongCustomer.id,
      subject: 'Strong A',
    });
    const strongMsgB = await insertMessage({
      templateVersionId: strongTemplate.currentVersion?.id ?? null,
      customerId: strongCustomer.id,
      subject: 'Strong B',
    });
    await insertEvent({ messageId: strongMsgA, eventType: 'open' });
    await insertEvent({ messageId: strongMsgA, eventType: 'open' }); // 2nd open, same message: still 1 unique
    await insertEvent({ messageId: strongMsgB, eventType: 'open' });

    const linkA = await insertLink({
      messageId: strongMsgA,
      originalUrl: 'https://example.com/popular-offer',
      linkLabel: 'Popular Offer',
    });
    await insertEvent({
      messageId: strongMsgA,
      linkId: linkA,
      eventType: 'click',
    });
    await insertEvent({
      messageId: strongMsgA,
      linkId: linkA,
      eventType: 'click',
    });
    // Bot click on the same link must be excluded from the leaderboard count.
    await insertEvent({
      messageId: strongMsgA,
      linkId: linkA,
      eventType: 'click',
      isBot: true,
    });

    const linkB = await insertLink({
      messageId: strongMsgB,
      originalUrl: 'https://example.com/quiet-page',
      linkLabel: 'Quiet Page',
    });
    await insertEvent({
      messageId: strongMsgB,
      linkId: linkB,
      eventType: 'click',
    });

    // --- Weak template: 2 delivered, only 1 opened (openRate 0.5) ---
    const weakMsgA = await insertMessage({
      templateVersionId: weakTemplate.currentVersion?.id ?? null,
      customerId: weakCustomer.id,
      subject: 'Weak A',
    });
    await insertMessage({
      templateVersionId: weakTemplate.currentVersion?.id ?? null,
      customerId: weakCustomer.id,
      subject: 'Weak B',
    });
    await insertEvent({ messageId: weakMsgA, eventType: 'open' });

    await statsRollupService.run(today);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests on every new route', async () => {
    await request(app.getHttpServer())
      .get('/analytics/leaderboards/templates')
      .expect(401);
    await request(app.getHttpServer())
      .get('/analytics/leaderboards/accounts')
      .expect(401);
    await request(app.getHttpServer())
      .get('/analytics/leaderboards/emails')
      .expect(401);
    await request(app.getHttpServer())
      .get('/analytics/leaderboards/links')
      .expect(401);
    await request(app.getHttpServer())
      .get('/analytics/leaderboards/customers')
      .expect(401);
    await request(app.getHttpServer()).get('/analytics/heatmap').expect(401);
  });

  it('ranks templates by open rate, computed from daily_stats rollups', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/analytics/leaderboards/templates?dateFrom=${dateFrom}&dateTo=${dateTo}&senderAccountId=${senderAccount.id}`,
      )
      .set('Cookie', adminCookies)
      .expect(200);
    const body = response.body as TemplateLeaderboardResponse;

    const strongEntry = body.find(
      (entry) => entry.templateId === strongTemplate.id,
    );
    const weakEntry = body.find(
      (entry) => entry.templateId === weakTemplate.id,
    );
    expect(strongEntry).toBeDefined();
    expect(weakEntry).toBeDefined();

    expect(strongEntry?.delivered).toBe(2);
    expect(strongEntry?.opensUnique).toBe(2);
    expect(strongEntry?.openRate).toBeCloseTo(1);
    expect(weakEntry?.delivered).toBe(2);
    expect(weakEntry?.opensUnique).toBe(1);
    expect(weakEntry?.openRate).toBeCloseTo(0.5);

    // Sorted by open rate descending, so the strong template ranks first.
    const strongIndex = body.findIndex(
      (entry) => entry.templateId === strongTemplate.id,
    );
    const weakIndex = body.findIndex(
      (entry) => entry.templateId === weakTemplate.id,
    );
    expect(strongIndex).toBeLessThan(weakIndex);
  });

  it('reports the sender account leaderboard scoped by the same daily_stats rollup', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/analytics/leaderboards/accounts?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      )
      .set('Cookie', adminCookies)
      .expect(200);
    const body = response.body as AccountLeaderboardResponse;

    const entry = body.find((row) => row.senderAccountId === senderAccount.id);
    expect(entry).toBeDefined();
    expect(entry?.sent).toBe(4);
    expect(entry?.delivered).toBe(4);
    expect(entry?.opensUnique).toBe(3);
  });

  it('ranks most-opened emails from raw tracking_events, excluding bot noise implicitly via delivered totals', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/analytics/leaderboards/emails?dateFrom=${dateFrom}&dateTo=${dateTo}&senderAccountId=${senderAccount.id}&limit=10`,
      )
      .set('Cookie', adminCookies)
      .expect(200);
    const body = response.body as TopEmailsResponse;

    const top = body[0];
    expect(top).toBeDefined();
    expect(top.subject).toBe('Strong A');
    expect(top.openCount).toBe(2);
    expect(top.clickCount).toBe(2); // 2 real clicks; the bot click is excluded
  });

  it('ranks most-clicked links aggregated by URL, excluding bot clicks', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/analytics/leaderboards/links?dateFrom=${dateFrom}&dateTo=${dateTo}&senderAccountId=${senderAccount.id}`,
      )
      .set('Cookie', adminCookies)
      .expect(200);
    const body = response.body as TopLinksResponse;

    const popular = body.find(
      (link) => link.originalUrl === 'https://example.com/popular-offer',
    );
    const quiet = body.find(
      (link) => link.originalUrl === 'https://example.com/quiet-page',
    );
    expect(popular?.totalClicks).toBe(2);
    expect(quiet?.totalClicks).toBe(1);

    const popularIndex = body.findIndex(
      (link) => link.originalUrl === 'https://example.com/popular-offer',
    );
    const quietIndex = body.findIndex(
      (link) => link.originalUrl === 'https://example.com/quiet-page',
    );
    expect(popularIndex).toBeLessThan(quietIndex);
  });

  it('ranks most-engaged customers by opens and clicks', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/analytics/leaderboards/customers?dateFrom=${dateFrom}&dateTo=${dateTo}&senderAccountId=${senderAccount.id}`,
      )
      .set('Cookie', adminCookies)
      .expect(200);
    const body = response.body as TopCustomersResponse;

    const strong = body.find((c) => c.customerId === strongCustomer.id);
    const weak = body.find((c) => c.customerId === weakCustomer.id);
    expect(strong).toBeDefined();
    expect(strong?.sent).toBe(2);
    expect(strong?.opensTotal).toBe(3);
    expect(strong?.clicksTotal).toBe(3);
    expect(weak?.opensTotal).toBe(1);
    expect(weak?.clicksTotal).toBe(0);

    const strongIndex = body.findIndex(
      (c) => c.customerId === strongCustomer.id,
    );
    const weakIndex = body.findIndex((c) => c.customerId === weakCustomer.id);
    expect(strongIndex).toBeLessThan(weakIndex);
  });

  it('buckets opens by weekday and hour for the send-time heatmap, excluding bot events', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/analytics/heatmap?dateFrom=${dateFrom}&dateTo=${dateTo}&senderAccountId=${senderAccount.id}`,
      )
      .set('Cookie', adminCookies)
      .expect(200);
    const body = response.body as SendTimeHeatmapResponse;

    // All 4 real opens (2 on strongMsgA, 1 on strongMsgB, 1 on weakMsgA) land
    // at noon UTC on `today`.
    const bucket = body.find(
      (point) => point.weekday === heatmapWeekday && point.hour === 12,
    );
    expect(bucket).toBeDefined();
    expect(bucket?.opens).toBe(4);
  });
});
