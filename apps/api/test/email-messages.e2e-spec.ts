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

describe('Email messages / compose (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let pool: Pool;
  let adminCookies: string[];
  let agentCookies: string[];
  let senderAccount: SenderAccountSummary;

  async function createCustomer(
    overrides: Partial<{ name: string; email: string }> = {},
  ): Promise<CustomerSummary> {
    const response = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', adminCookies)
      .send({
        name: overrides.name ?? 'Jane Doe',
        email: overrides.email ?? `jane-${randomUUID()}@example.com`,
      })
      .expect(201);
    return response.body as CustomerSummary;
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

    adminCookies = await loginAsNewUser('admin');
    agentCookies = await loginAsNewUser('agent');

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
    await request(app.getHttpServer())
      .get('/email-messages/does-not-matter')
      .expect(401);
  });

  it('renders merge fields, queues, and stores an attachment for an ad-hoc compose', async () => {
    const customer = await createCustomer();

    const payload = {
      senderAccountId: senderAccount.id,
      customerIds: [customer.id],
      subject: 'Your quote, {{customer.name}}',
      bodyHtml:
        '<html><head><style>.hi{color:red}</style></head><body><p class="hi">Hi {{customer.name}} from {{sender.name}}</p></body></html>',
    };

    const composeResponse = await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', agentCookies)
      .field('payload', JSON.stringify(payload))
      .attach('attachments', Buffer.from('hello world'), 'notes.txt')
      .expect(201);

    const composeBody = composeResponse.body as ComposeSendResponse;
    expect(composeBody.results).toHaveLength(1);
    expect(composeBody.results[0].ok).toBe(true);
    expect(composeBody.results[0].customerId).toBe(customer.id);
    const messageId = composeBody.results[0].messageId as string;

    const getResponse = await request(app.getHttpServer())
      .get(`/email-messages/${messageId}`)
      .set('Cookie', agentCookies)
      .expect(200);
    const message = getResponse.body as EmailMessageSummary;
    expect(message.status).toBe('queued');
    expect(message.subject).toBe(`Your quote, ${customer.name}`);
    expect(message.toEmail).toBe(customer.email);
    expect(message.trackingEnabled).toBe(true);
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments[0].filename).toBe('notes.txt');
  });

  it('fails a recipient with unresolved merge fields instead of the whole batch', async () => {
    const known = await createCustomer();

    const response = await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', agentCookies)
      .field(
        'payload',
        JSON.stringify({
          senderAccountId: senderAccount.id,
          customerIds: [known.id],
          subject: 'Quote {{quotation.number}}',
          bodyHtml: '<p>{{quotation.number}}</p>',
        }),
      )
      .expect(201);

    const body = response.body as ComposeSendResponse;
    expect(body.results[0].ok).toBe(false);
    expect(body.results[0].error).toContain('quotation.number');
  });

  it('blocks a suppressed customer unless an admin overrides it', async () => {
    const customer = await createCustomer();
    await pool.query(
      `INSERT INTO suppressions (email, customer_id, reason) VALUES ($1, $2, 'hard_bounce')`,
      [customer.email, customer.id],
    );

    const blockedResponse = await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', agentCookies)
      .field(
        'payload',
        JSON.stringify({
          senderAccountId: senderAccount.id,
          customerIds: [customer.id],
          subject: 'Hi',
          bodyHtml: '<p>Hi</p>',
        }),
      )
      .expect(201);
    const blockedBody = blockedResponse.body as ComposeSendResponse;
    expect(blockedBody.results[0].ok).toBe(false);
    expect(blockedBody.results[0].error).toContain('suppressed');

    // A non-admin cannot override, even when asking to.
    const agentOverrideResponse = await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', agentCookies)
      .field(
        'payload',
        JSON.stringify({
          senderAccountId: senderAccount.id,
          customerIds: [customer.id],
          subject: 'Hi',
          bodyHtml: '<p>Hi</p>',
          overrideSuppression: true,
        }),
      )
      .expect(201);
    expect(
      (agentOverrideResponse.body as ComposeSendResponse).results[0].ok,
    ).toBe(false);

    const adminOverrideResponse = await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', adminCookies)
      .field(
        'payload',
        JSON.stringify({
          senderAccountId: senderAccount.id,
          customerIds: [customer.id],
          subject: 'Hi',
          bodyHtml: '<p>Hi</p>',
          overrideSuppression: true,
        }),
      )
      .expect(201);
    expect(
      (adminOverrideResponse.body as ComposeSendResponse).results[0].ok,
    ).toBe(true);
  });

  it('rejects attachments over the 25 MB total limit', async () => {
    const customer = await createCustomer();
    const bigBuffer = Buffer.alloc(26 * 1024 * 1024);

    await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', agentCookies)
      .field(
        'payload',
        JSON.stringify({
          senderAccountId: senderAccount.id,
          customerIds: [customer.id],
          subject: 'Hi',
          bodyHtml: '<p>Hi</p>',
        }),
      )
      .attach('attachments', bigBuffer, 'big.bin')
      .expect(413);
  });

  it('rejects several attachments whose combined size exceeds the 25 MB total limit', async () => {
    const customer = await createCustomer();
    const chunk = Buffer.alloc(13 * 1024 * 1024);

    await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', agentCookies)
      .field(
        'payload',
        JSON.stringify({
          senderAccountId: senderAccount.id,
          customerIds: [customer.id],
          subject: 'Hi',
          bodyHtml: '<p>Hi</p>',
        }),
      )
      .attach('attachments', chunk, 'a.bin')
      .attach('attachments', chunk, 'b.bin')
      .expect(400);
  });
});
