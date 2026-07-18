import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Pool } from 'pg';
import { App } from 'supertest/types';
import type {
  ComplianceSettings,
  ComposeSendResponse,
  CustomerErasureResult,
  CustomerGdprExport,
  CustomerSummary,
  EmailMessageSummary,
  PlatformSettings,
  RetentionSettings,
  SenderAccountSummary,
} from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';
import { PG_POOL } from './../src/database/database.constants';
import type { EmailMessageRow, SuppressionRow } from './../src/database/rows';
import { loginAsRole } from './helpers/auth';

describe('Compliance & unsubscribe (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let pool: Pool;
  let adminCookies: string[];
  let managerCookies: string[];
  let senderAccount: SenderAccountSummary;

  async function composeMessage(): Promise<{
    message: EmailMessageSummary;
    customer: CustomerSummary;
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
          bodyHtml: '<p>Hi there</p>',
        }),
      )
      .expect(201);
    const messageId = (composeResponse.body as ComposeSendResponse).results[0]
      .messageId as string;

    const getResponse = await request(app.getHttpServer())
      .get(`/email-messages/${messageId}`)
      .set('Cookie', adminCookies)
      .expect(200);

    return { message: getResponse.body as EmailMessageSummary, customer };
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

    adminCookies = (await loginAsRole(app, usersRepository, 'admin')).cookies;
    managerCookies = (await loginAsRole(app, usersRepository, 'manager'))
      .cookies;

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

  describe('compose footer', () => {
    it('appends an unsubscribe link and List-Unsubscribe-ready token to every send', async () => {
      const { message } = await composeMessage();
      expect(message.publicToken).toBeTruthy();

      const { rows } = await pool.query<EmailMessageRow>(
        `SELECT * FROM email_messages WHERE id = $1`,
        [message.id],
      );
      expect(rows[0].body_html_rendered).toContain(`/u/${message.publicToken}`);
    });
  });

  describe('settings', () => {
    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer()).get('/settings').expect(401);
    });

    it('rejects non-admins', async () => {
      await request(app.getHttpServer())
        .get('/settings')
        .set('Cookie', managerCookies)
        .expect(403);
    });

    it('returns defaults, then persists an admin update', async () => {
      const initial = await request(app.getHttpServer())
        .get('/settings')
        .set('Cookie', adminCookies)
        .expect(200);
      expect((initial.body as PlatformSettings).retention).toEqual({
        rawEventsDays: 180,
        piiDays: 730,
      });

      const updateResponse = await request(app.getHttpServer())
        .patch('/settings/compliance')
        .set('Cookie', adminCookies)
        .send({ physicalAddress: '123 Main St, Springfield' })
        .expect(200);
      expect((updateResponse.body as ComplianceSettings).physicalAddress).toBe(
        '123 Main St, Springfield',
      );

      const retentionUpdate = await request(app.getHttpServer())
        .patch('/settings/retention')
        .set('Cookie', adminCookies)
        .send({ rawEventsDays: 90, piiDays: 365 })
        .expect(200);
      expect((retentionUpdate.body as RetentionSettings).rawEventsDays).toBe(
        90,
      );

      const nextMessage = await composeMessage();
      const { rows } = await pool.query<EmailMessageRow>(
        `SELECT * FROM email_messages WHERE id = $1`,
        [nextMessage.message.id],
      );
      expect(rows[0].body_html_rendered).toContain('123 Main St, Springfield');

      // Reset retention — settings are process-wide state shared with every
      // other e2e spec file hitting the same test database. The compliance
      // address is left as-is (the schema requires a non-empty address, so
      // there's no valid "unset" to reset it to); other specs only assert
      // substrings of rendered bodies, never its absence.
      await request(app.getHttpServer())
        .patch('/settings/retention')
        .set('Cookie', adminCookies)
        .send({ rawEventsDays: 180, piiDays: 730 })
        .expect(200);
    });
  });

  describe('public unsubscribe page', () => {
    it('shows a confirm page for a known token and 404s for an unknown one', async () => {
      const { message, customer } = await composeMessage();

      const confirmResponse = await request(app.getHttpServer())
        .get(`/u/${message.publicToken}`)
        .expect(200);
      expect(confirmResponse.headers['content-type']).toContain('text/html');
      expect(confirmResponse.text).toContain(customer.email);

      await request(app.getHttpServer())
        .get('/u/this-token-does-not-exist')
        .expect(404);
    });

    it('unsubscribing suppresses the address, marks the message, and records an event', async () => {
      const { message, customer } = await composeMessage();

      const response = await request(app.getHttpServer())
        .post(`/u/${message.publicToken}`)
        .expect(200);
      expect(response.text).toContain(customer.email);

      const { rows: messageRows } = await pool.query<EmailMessageRow>(
        `SELECT * FROM email_messages WHERE id = $1`,
        [message.id],
      );
      expect(messageRows[0].unsubscribed_at).not.toBeNull();

      const { rows: suppressionRows } = await pool.query<SuppressionRow>(
        `SELECT * FROM suppressions WHERE email = $1`,
        [customer.email],
      );
      expect(suppressionRows).toHaveLength(1);
      expect(suppressionRows[0].reason).toBe('unsubscribe');
      expect(suppressionRows[0].released_at).toBeNull();

      const { rows: eventRows } = await pool.query(
        `SELECT * FROM tracking_events WHERE message_id = $1 AND event_type = 'unsubscribe'`,
        [message.id],
      );
      expect(eventRows).toHaveLength(1);

      // Repeat clicks (or a retried RFC 8058 one-click POST) must not error.
      await request(app.getHttpServer())
        .post(`/u/${message.publicToken}`)
        .expect(200);

      // Compose now blocks this recipient as suppressed.
      const composeResponse = await request(app.getHttpServer())
        .post('/email-messages/compose')
        .set('Cookie', adminCookies)
        .field(
          'payload',
          JSON.stringify({
            senderAccountId: senderAccount.id,
            customerIds: [customer.id],
            subject: 'Another one',
            bodyHtml: '<p>Hi</p>',
          }),
        )
        .expect(201);
      const result = (composeResponse.body as ComposeSendResponse).results[0];
      expect(result.ok).toBe(false);
      expect(result.error).toContain('unsubscribed');
    });

    it('404s a POST to an unknown token', async () => {
      await request(app.getHttpServer())
        .post('/u/this-token-does-not-exist')
        .expect(404);
    });
  });

  describe('GDPR export & erasure', () => {
    it('rejects non-admins from exporting or erasing', async () => {
      const { customer } = await composeMessage();
      await request(app.getHttpServer())
        .get(`/customers/${customer.id}/gdpr-export`)
        .set('Cookie', managerCookies)
        .expect(403);
      await request(app.getHttpServer())
        .post(`/customers/${customer.id}/erase`)
        .set('Cookie', managerCookies)
        .expect(403);
    });

    it('exports everything held for a customer', async () => {
      const { message, customer } = await composeMessage();

      const response = await request(app.getHttpServer())
        .get(`/customers/${customer.id}/gdpr-export`)
        .set('Cookie', adminCookies)
        .expect(200);
      const body = response.body as CustomerGdprExport;

      expect(body.customer.email).toBe(customer.email);
      expect(body.messages.some((m) => m.id === message.id)).toBe(true);
    });

    it('erasure deletes the customer and anonymizes their messages, keeping the address suppressed', async () => {
      const { message, customer } = await composeMessage();
      await request(app.getHttpServer())
        .post(`/u/${message.publicToken}`)
        .expect(200);

      const eraseResponse = await request(app.getHttpServer())
        .post(`/customers/${customer.id}/erase`)
        .set('Cookie', adminCookies)
        .expect(201);
      const result = eraseResponse.body as CustomerErasureResult;
      expect(result.erasedCustomerId).toBe(customer.id);
      expect(result.anonymizedMessageCount).toBeGreaterThanOrEqual(1);

      await request(app.getHttpServer())
        .get(`/customers/${customer.id}`)
        .set('Cookie', adminCookies)
        .expect(404);

      const { rows: messageRows } = await pool.query<EmailMessageRow>(
        `SELECT * FROM email_messages WHERE id = $1`,
        [message.id],
      );
      expect(messageRows[0].customer_id).toBeNull();
      expect(messageRows[0].to_email).not.toBe(customer.email);
      expect(messageRows[0].body_html_rendered).toBeNull();

      // The suppression from the earlier unsubscribe survives erasure —
      // the address must stay blocked even though the customer row is gone.
      const { rows: suppressionRows } = await pool.query<SuppressionRow>(
        `SELECT * FROM suppressions WHERE email = $1`,
        [customer.email],
      );
      expect(suppressionRows).toHaveLength(1);
      expect(suppressionRows[0].customer_id).toBeNull();
    });
  });
});
