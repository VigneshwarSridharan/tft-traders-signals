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
  EmailMessageSummary,
  SenderAccountSummary,
} from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';
import { PG_POOL } from './../src/database/database.constants';
import { TrackingEventProcessorService } from './../src/tracking/tracking-event-processor.service';
import type {
  EmailLinkRow,
  EmailMessageRow,
  TrackingEventRow,
} from './../src/database/rows';

describe('Tracking (e2e)', () => {
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

  async function composeTrackedMessage(): Promise<{
    message: EmailMessageSummary;
    link: EmailLinkRow;
  }> {
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', adminCookies)
      .send({
        name: 'Jane Doe',
        email: `jane-${randomUUID()}@example.com`,
      })
      .expect(201);
    const customer = customerResponse.body as CustomerSummary;

    const composeResponse = await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', adminCookies)
      .field(
        'payload',
        JSON.stringify({
          senderAccountId: senderAccount.id,
          customerIds: [customer.id],
          subject: 'Your quote',
          bodyHtml:
            '<p>Hi <a href="https://example.com/quote?id=1">view your quote</a></p>',
        }),
      )
      .expect(201);
    const messageId = (composeResponse.body as ComposeSendResponse).results[0]
      .messageId as string;

    const getResponse = await request(app.getHttpServer())
      .get(`/email-messages/${messageId}`)
      .set('Cookie', adminCookies)
      .expect(200);
    const message = getResponse.body as EmailMessageSummary;

    const { rows } = await pool.query<EmailLinkRow>(
      `SELECT * FROM email_links WHERE message_id = $1`,
      [messageId],
    );
    return { message, link: rows[0] };
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

  it('injects a pixel and rewrites links into tracked URLs at compose time', async () => {
    const { message, link } = await composeTrackedMessage();

    expect(link).toBeDefined();
    expect(link.original_url).toBe('https://example.com/quote?id=1');
    expect(message.trackingEnabled).toBe(true);
  });

  it('serves the tracking pixel with no-store headers regardless of token validity', async () => {
    const response = await request(app.getHttpServer())
      .get('/o/some-random-token.gif')
      .expect(200);

    expect(response.headers['content-type']).toBe('image/gif');
    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(response.body).toBeInstanceOf(Buffer);
    expect((response.body as Buffer).length).toBeGreaterThan(0);
  });

  it('redirects a known click token to the stored original URL, never the request', async () => {
    const { link } = await composeTrackedMessage();

    const response = await request(app.getHttpServer())
      .get(`/c/${link.token}`)
      .expect(302);

    expect(response.headers.location).toBe(link.original_url);
  });

  it('redirects an unknown click token to the app homepage', async () => {
    const response = await request(app.getHttpServer())
      .get('/c/this-token-does-not-exist')
      .expect(302);

    expect(response.headers.location).toBe('http://localhost:3001');
  });

  it('records a real open event and updates message counters end-to-end', async () => {
    const { message } = await composeTrackedMessage();

    await processor.processJob({
      data: {
        kind: 'open',
        token: message.publicToken,
        ip: '203.0.113.9',
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile Safari',
        occurredAt: new Date().toISOString(),
      },
    } as never);

    const { rows: eventRows } = await pool.query<TrackingEventRow>(
      `SELECT * FROM tracking_events WHERE message_id = $1 AND event_type = 'open'`,
      [message.id],
    );
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0].is_bot).toBe(false);
    expect(eventRows[0].device_type).toBe('mobile');

    const { rows: messageRows } = await pool.query<EmailMessageRow>(
      `SELECT * FROM email_messages WHERE id = $1`,
      [message.id],
    );
    expect(messageRows[0].open_count).toBe(1);
    expect(messageRows[0].first_opened_at).not.toBeNull();
  });

  it('records a click, infers an open, and flags scanner clicks as bot without bumping counters', async () => {
    const { message, link } = await composeTrackedMessage();

    await processor.processJob({
      data: {
        kind: 'click',
        token: link.token,
        linkId: link.id,
        messageId: message.id,
        ip: '203.0.113.9',
        userAgent: 'Outlook-SafeLinks/1.0',
        occurredAt: new Date().toISOString(),
      },
    } as never);

    const { rows: clickRows } = await pool.query<TrackingEventRow>(
      `SELECT * FROM tracking_events WHERE message_id = $1 AND event_type = 'click'`,
      [message.id],
    );
    expect(clickRows).toHaveLength(1);
    expect(clickRows[0].is_bot).toBe(true);

    const { rows: messageRows } = await pool.query<EmailMessageRow>(
      `SELECT * FROM email_messages WHERE id = $1`,
      [message.id],
    );
    // Bot-flagged click must not count towards headline metrics.
    expect(messageRows[0].click_count).toBe(0);
    expect(messageRows[0].open_count).toBe(0);
  });
});
