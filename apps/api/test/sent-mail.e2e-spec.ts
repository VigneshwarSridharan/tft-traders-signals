import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { Pool } from 'pg';
import { App } from 'supertest/types';
import type {
  ComposeSendResponse,
  CustomerSummary,
  EmailMessageDetail,
  EmailMessageListResponse,
  EmailMessageTimelineResponse,
  SavedMessageFilter,
  SenderAccountSummary,
  TagSummary,
} from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';
import { PG_POOL } from './../src/database/database.constants';
import { TrackingEventProcessorService } from './../src/tracking/tracking-event-processor.service';

describe('Sent-mail dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let pool: Pool;
  let processor: TrackingEventProcessorService;
  let adminCookies: string[];
  let senderAccount: SenderAccountSummary;

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

  async function createCustomer(name: string): Promise<CustomerSummary> {
    const response = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', adminCookies)
      .send({ name, email: `${randomUUID()}@example.com` })
      .expect(201);
    return response.body as CustomerSummary;
  }

  async function composeMessage(customer: CustomerSummary): Promise<string> {
    const composeResponse = await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', adminCookies)
      .field(
        'payload',
        JSON.stringify({
          senderAccountId: senderAccount.id,
          customerIds: [customer.id],
          subject: `Quote for ${customer.name}`,
          bodyHtml:
            '<p>Hi <a href="https://example.com/quote?id=1">view your quote</a></p>',
        }),
      )
      .expect(201);
    return (composeResponse.body as ComposeSendResponse).results[0]
      .messageId as string;
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
    processor = app.get(TrackingEventProcessorService);

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/email-messages').expect(401);
  });

  it('lists sent mail with search, status filter, and pagination', async () => {
    const customer = await createCustomer('Searchable Customer');
    const messageId = await composeMessage(customer);

    const searchResponse = await request(app.getHttpServer())
      .get('/email-messages')
      .query({ search: customer.email, page: 1, pageSize: 25 })
      .set('Cookie', adminCookies)
      .expect(200);
    const searchResult = searchResponse.body as EmailMessageListResponse;
    expect(searchResult.items.some((item) => item.id === messageId)).toBe(true);
    expect(searchResult.page).toBe(1);
    expect(searchResult.pageSize).toBe(25);

    const statusResponse = await request(app.getHttpServer())
      .get('/email-messages')
      .query({ status: 'queued', search: customer.email })
      .set('Cookie', adminCookies)
      .expect(200);
    const statusResult = statusResponse.body as EmailMessageListResponse;
    expect(statusResult.items.every((item) => item.status === 'queued')).toBe(
      true,
    );

    const noMatchResponse = await request(app.getHttpServer())
      .get('/email-messages')
      .query({ search: `nobody-${randomUUID()}@example.com` })
      .set('Cookie', adminCookies)
      .expect(200);
    expect((noMatchResponse.body as EmailMessageListResponse).items).toEqual(
      [],
    );
  });

  it('filters the list by tag', async () => {
    const customer = await createCustomer('Tagged Customer');
    const messageId = await composeMessage(customer);

    const tagResponse = await request(app.getHttpServer())
      .post('/tags')
      .set('Cookie', adminCookies)
      .send({ name: `vip-${randomUUID()}` })
      .expect(201);
    const tag = tagResponse.body as TagSummary;

    await request(app.getHttpServer())
      .post(`/email-messages/${messageId}/tags`)
      .set('Cookie', adminCookies)
      .send({ tagId: tag.id })
      .expect(201);

    const filteredResponse = await request(app.getHttpServer())
      .get('/email-messages')
      .query({ tagId: tag.id })
      .set('Cookie', adminCookies)
      .expect(200);
    const filtered = filteredResponse.body as EmailMessageListResponse;
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0].id).toBe(messageId);
    expect(filtered.items[0].tags).toEqual([
      { id: tag.id, name: tag.name, color: tag.color },
    ]);

    await request(app.getHttpServer())
      .delete(`/email-messages/${messageId}/tags/${tag.id}`)
      .set('Cookie', adminCookies)
      .expect(200);

    const afterRemoveResponse = await request(app.getHttpServer())
      .get('/email-messages')
      .query({ tagId: tag.id })
      .set('Cookie', adminCookies)
      .expect(200);
    expect(
      (afterRemoveResponse.body as EmailMessageListResponse).items,
    ).toHaveLength(0);
  });

  it('returns a detail view whose non-bot timeline count matches the denormalized counters', async () => {
    const customer = await createCustomer('Detail Customer');
    const messageId = await composeMessage(customer);

    const { rows: linkRows } = await pool.query<{ id: string; token: string }>(
      `SELECT id, token FROM email_links WHERE message_id = $1`,
      [messageId],
    );
    const link = linkRows[0];

    await processor.processJob({
      data: {
        kind: 'open',
        token: (
          await pool.query<{ public_token: string }>(
            `SELECT public_token FROM email_messages WHERE id = $1`,
            [messageId],
          )
        ).rows[0].public_token,
        ip: '203.0.113.9',
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile Safari',
        occurredAt: new Date().toISOString(),
      },
    } as never);

    await processor.processJob({
      data: {
        kind: 'click',
        token: link.token,
        linkId: link.id,
        messageId,
        ip: '203.0.113.9',
        userAgent: 'Outlook-SafeLinks/1.0',
        occurredAt: new Date().toISOString(),
      },
    } as never);

    const detailResponse = await request(app.getHttpServer())
      .get(`/email-messages/${messageId}`)
      .set('Cookie', adminCookies)
      .expect(200);
    const detail = detailResponse.body as EmailMessageDetail;
    expect(detail.openCount).toBe(1);
    expect(detail.clickCount).toBe(0);
    expect(detail.bounce).toBeNull();
    expect(detail.bounceType).toBe('none');

    const timelineResponse = await request(app.getHttpServer())
      .get(`/email-messages/${messageId}/timeline`)
      .set('Cookie', adminCookies)
      .expect(200);
    const timeline = timelineResponse.body as EmailMessageTimelineResponse;
    const nonBotEvents = timeline.events.filter((event) => !event.isBot);
    expect(nonBotEvents).toHaveLength(detail.openCount + detail.clickCount);
    expect(timeline.links).toHaveLength(1);
    expect(timeline.links[0].originalUrl).toBe(
      'https://example.com/quote?id=1',
    );

    const withBotsResponse = await request(app.getHttpServer())
      .get(`/email-messages/${messageId}/timeline`)
      .query({ includeBotEvents: true })
      .set('Cookie', adminCookies)
      .expect(200);
    const withBots = withBotsResponse.body as EmailMessageTimelineResponse;
    expect(withBots.events.length).toBeGreaterThan(nonBotEvents.length);
    expect(withBots.events.some((event) => event.isBot)).toBe(true);
  });

  it('surfaces the bounce diagnostic on the detail view after a hard bounce', async () => {
    const customer = await createCustomer('Bounce Customer');
    const messageId = await composeMessage(customer);

    await pool.query(
      `UPDATE email_messages SET status = 'bounced', bounce_type = 'hard' WHERE id = $1`,
      [messageId],
    );
    await pool.query(
      `INSERT INTO bounces (message_id, bounce_class, status_code, diagnostic, bounced_at)
       VALUES ($1, 'hard', '5.1.1', 'The email account does not exist', now())`,
      [messageId],
    );

    const detailResponse = await request(app.getHttpServer())
      .get(`/email-messages/${messageId}`)
      .set('Cookie', adminCookies)
      .expect(200);
    const detail = detailResponse.body as EmailMessageDetail;
    expect(detail.bounceType).toBe('hard');
    expect(detail.bounce).toEqual({
      bounceClass: 'hard',
      statusCode: '5.1.1',
      diagnostic: 'The email account does not exist',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() is inherently `any` in @types/jest
      bouncedAt: expect.any(String),
    });
  });

  it('creates, lists, and deletes a saved filter scoped to the user', async () => {
    const created = await request(app.getHttpServer())
      .post('/email-messages/saved-filters')
      .set('Cookie', adminCookies)
      .send({ name: 'Bounced this week', filter: { status: 'bounced' } })
      .expect(201);
    const savedFilter = created.body as SavedMessageFilter;
    expect(savedFilter.name).toBe('Bounced this week');
    expect(savedFilter.filter.status).toBe('bounced');

    const listResponse = await request(app.getHttpServer())
      .get('/email-messages/saved-filters')
      .set('Cookie', adminCookies)
      .expect(200);
    expect(
      (listResponse.body as SavedMessageFilter[]).some(
        (f) => f.id === savedFilter.id,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .delete(`/email-messages/saved-filters/${savedFilter.id}`)
      .set('Cookie', adminCookies)
      .expect(204);

    const afterDeleteResponse = await request(app.getHttpServer())
      .get('/email-messages/saved-filters')
      .set('Cookie', adminCookies)
      .expect(200);
    expect(
      (afterDeleteResponse.body as SavedMessageFilter[]).some(
        (f) => f.id === savedFilter.id,
      ),
    ).toBe(false);
  });

  it('does not leak another user’s saved filters', async () => {
    const otherCookies = await loginAsNewUser('agent');
    await request(app.getHttpServer())
      .post('/email-messages/saved-filters')
      .set('Cookie', adminCookies)
      .send({ name: 'Admin only filter', filter: {} })
      .expect(201);

    const otherListResponse = await request(app.getHttpServer())
      .get('/email-messages/saved-filters')
      .set('Cookie', otherCookies)
      .expect(200);
    expect(
      (otherListResponse.body as SavedMessageFilter[]).some(
        (f) => f.name === 'Admin only filter',
      ),
    ).toBe(false);
  });
});
