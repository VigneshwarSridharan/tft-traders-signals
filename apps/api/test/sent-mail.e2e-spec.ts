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
  EmailTemplateSummary,
  SenderAccountSummary,
  SentMailDetail,
  SentMailListResponse,
  TagSummary,
  TemplateCategorySummary,
} from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';
import { PG_POOL } from './../src/database/database.constants';
import { TrackingEventProcessorService } from './../src/tracking/tracking-event-processor.service';
import type { EmailLinkRow } from './../src/database/rows';

describe('Sent mail (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let pool: Pool;
  let processor: TrackingEventProcessorService;
  let adminCookies: string[];
  let senderAccount: SenderAccountSummary;
  let template: EmailTemplateSummary;

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

  async function composeMessage(
    overrides: {
      toEmail?: string;
      useTemplate?: boolean;
    } = {},
  ): Promise<{ messageId: string; toEmail: string }> {
    const email = overrides.toEmail ?? `jane-${randomUUID()}@example.com`;
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', adminCookies)
      .send({ name: 'Jane Doe', email })
      .expect(201);
    const customer = customerResponse.body as CustomerSummary;

    const payload = overrides.useTemplate
      ? {
          senderAccountId: senderAccount.id,
          customerIds: [customer.id],
          templateVersionId: template.currentVersion?.id,
        }
      : {
          senderAccountId: senderAccount.id,
          customerIds: [customer.id],
          subject: 'Your quote',
          bodyHtml:
            '<p>Hi <a href="https://example.com/quote?id=1">view your quote</a></p>',
        };

    const composeResponse = await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', adminCookies)
      .field('payload', JSON.stringify(payload))
      .expect(201);
    const messageId = (composeResponse.body as ComposeSendResponse).results[0]
      .messageId as string;

    return { messageId, toEmail: email };
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
        subject: 'Your quote, {{customer.name}}',
        bodyHtml: '<p>Hi {{customer.name}}</p>',
      })
      .expect(201);
    template = templateResponse.body as EmailTemplateSummary;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/sent-mail').expect(401);
    await request(app.getHttpServer())
      .get('/sent-mail/00000000-0000-0000-0000-000000000000')
      .expect(401);
  });

  it('lists sent messages and supports search, status, sender, and template filters', async () => {
    const { messageId, toEmail } = await composeMessage({ useTemplate: true });

    const searchResponse = await request(app.getHttpServer())
      .get(`/sent-mail?search=${encodeURIComponent(toEmail)}`)
      .set('Cookie', adminCookies)
      .expect(200);
    const searchResult = searchResponse.body as SentMailListResponse;
    expect(searchResult.items.some((item) => item.id === messageId)).toBe(true);
    expect(searchResult.items[0].templateName).toBe(template.name);
    expect(searchResult.items[0].senderAccountEmail).toBe(senderAccount.email);

    const statusResponse = await request(app.getHttpServer())
      .get(`/sent-mail?status=queued&senderAccountId=${senderAccount.id}`)
      .set('Cookie', adminCookies)
      .expect(200);
    const statusResult = statusResponse.body as SentMailListResponse;
    expect(statusResult.items.some((item) => item.id === messageId)).toBe(true);

    const templateResponse = await request(app.getHttpServer())
      .get(`/sent-mail?templateId=${template.id}`)
      .set('Cookie', adminCookies)
      .expect(200);
    const templateResult = templateResponse.body as SentMailListResponse;
    expect(templateResult.items.some((item) => item.id === messageId)).toBe(
      true,
    );

    const noMatchResponse = await request(app.getHttpServer())
      .get(`/sent-mail?search=${encodeURIComponent(randomUUID())}`)
      .set('Cookie', adminCookies)
      .expect(200);
    expect((noMatchResponse.body as SentMailListResponse).items).toHaveLength(
      0,
    );
  });

  it('paginates results', async () => {
    await composeMessage();
    await composeMessage();

    const response = await request(app.getHttpServer())
      .get('/sent-mail?page=1&pageSize=1')
      .set('Cookie', adminCookies)
      .expect(200);
    const result = response.body as SentMailListResponse;
    expect(result.items).toHaveLength(1);
    expect(result.pageSize).toBe(1);
    expect(result.total).toBeGreaterThanOrEqual(2);
  });

  it('returns a detail view with the rendered snapshot, event timeline, and link clicks', async () => {
    const { messageId } = await composeMessage();

    const { rows: linkRows } = await pool.query<EmailLinkRow>(
      `SELECT * FROM email_links WHERE message_id = $1`,
      [messageId],
    );
    const link = linkRows[0];

    const getResponse = await request(app.getHttpServer())
      .get(`/sent-mail/${messageId}`)
      .set('Cookie', adminCookies)
      .expect(200);
    const before = getResponse.body as SentMailDetail;
    expect(before.bodyHtmlRendered).toContain('view your quote');
    expect(before.events).toHaveLength(0);
    expect(before.links).toHaveLength(1);
    expect(before.links[0].originalUrl).toBe('https://example.com/quote?id=1');

    await processor.processJob({
      data: {
        kind: 'open',
        token: before.publicToken,
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
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile Safari',
        occurredAt: new Date().toISOString(),
      },
    } as never);

    const afterResponse = await request(app.getHttpServer())
      .get(`/sent-mail/${messageId}`)
      .set('Cookie', adminCookies)
      .expect(200);
    const after = afterResponse.body as SentMailDetail;
    expect(after.openCount).toBe(1);
    expect(after.clickCount).toBe(1);
    expect(after.events).toHaveLength(2);
    const clickEvent = after.events.find((e) => e.eventType === 'click');
    expect(clickEvent?.linkUrl).toBe('https://example.com/quote?id=1');
    expect(clickEvent?.deviceType).toBe('mobile');
    expect(after.links[0].clickCount).toBe(1);
  });

  it('excludes bot events by default and includes them when requested', async () => {
    const { messageId } = await composeMessage();
    const getResponse = await request(app.getHttpServer())
      .get(`/sent-mail/${messageId}`)
      .set('Cookie', adminCookies)
      .expect(200);
    const { publicToken } = getResponse.body as SentMailDetail;

    await processor.processJob({
      data: {
        kind: 'open',
        token: publicToken,
        ip: '203.0.113.9',
        userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0)',
        occurredAt: new Date().toISOString(),
      },
    } as never);

    const withoutBots = await request(app.getHttpServer())
      .get(`/sent-mail/${messageId}`)
      .set('Cookie', adminCookies)
      .expect(200);
    expect((withoutBots.body as SentMailDetail).events).toHaveLength(0);

    const withBots = await request(app.getHttpServer())
      .get(`/sent-mail/${messageId}?includeBotEvents=true`)
      .set('Cookie', adminCookies)
      .expect(200);
    const withBotsEvents = (withBots.body as SentMailDetail).events;
    expect(withBotsEvents).toHaveLength(1);
    expect(withBotsEvents[0].isBot).toBe(true);
  });

  it('surfaces the bounce diagnostic for a bounced message', async () => {
    const { messageId } = await composeMessage();

    const { rows: inboundRows } = await pool.query<{ id: string }>(
      `INSERT INTO inbound_messages
         (sender_account_id, imap_uid, from_email, subject, classification, matched_message_id, raw_headers)
       VALUES ($1, $2, $3, $4, 'bounce_dsn', $5, '{}')
       RETURNING id`,
      [
        senderAccount.id,
        Math.floor(Math.random() * 1_000_000),
        'mailer-daemon@example.com',
        'Undelivered Mail Returned to Sender',
        messageId,
      ],
    );
    await pool.query(
      `INSERT INTO bounces (message_id, inbound_message_id, bounce_class, status_code, diagnostic, bounced_at)
       VALUES ($1, $2, 'hard', '5.1.1', 'User unknown', now())`,
      [messageId, inboundRows[0].id],
    );
    await pool.query(
      `UPDATE email_messages SET status = 'bounced', bounce_type = 'hard' WHERE id = $1`,
      [messageId],
    );

    const response = await request(app.getHttpServer())
      .get(`/sent-mail/${messageId}`)
      .set('Cookie', adminCookies)
      .expect(200);
    const detail = response.body as SentMailDetail;
    expect(detail.status).toBe('bounced');
    expect(detail.bounce).toMatchObject({
      bounceClass: 'hard',
      statusCode: '5.1.1',
      diagnostic: 'User unknown',
    });
  });

  it('assigns and removes a tag on a message, filterable via the tag quick filter', async () => {
    const { messageId } = await composeMessage();
    const tagResponse = await request(app.getHttpServer())
      .post('/tags')
      .set('Cookie', adminCookies)
      .send({ name: `VIP ${randomUUID()}` })
      .expect(201);
    const tag = tagResponse.body as TagSummary;

    const addResponse = await request(app.getHttpServer())
      .post(`/sent-mail/${messageId}/tags`)
      .set('Cookie', adminCookies)
      .send({ tagId: tag.id })
      .expect(201);
    expect((addResponse.body as SentMailDetail).tags).toEqual([
      { id: tag.id, name: tag.name, color: null },
    ]);

    const filteredResponse = await request(app.getHttpServer())
      .get(`/sent-mail?tagId=${tag.id}`)
      .set('Cookie', adminCookies)
      .expect(200);
    expect(
      (filteredResponse.body as SentMailListResponse).items.map((i) => i.id),
    ).toEqual([messageId]);

    const removeResponse = await request(app.getHttpServer())
      .delete(`/sent-mail/${messageId}/tags/${tag.id}`)
      .set('Cookie', adminCookies)
      .expect(200);
    expect((removeResponse.body as SentMailDetail).tags).toEqual([]);
  });

  it('returns 404 for an unknown message id', async () => {
    await request(app.getHttpServer())
      .get('/sent-mail/00000000-0000-0000-0000-000000000000')
      .set('Cookie', adminCookies)
      .expect(404);
  });
});
