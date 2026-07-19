import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  ReportSubscriptionSummary,
  SenderAccountSummary,
} from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';
import { loginAsRole } from './helpers/auth';

/**
 * v2 backlog item — scheduled/emailed periodic reports: subscription CRUD
 * (admin/manager) plus enqueueing a manual run. The worker that actually
 * generates the report and sends it via SMTP isn't exercised here — like
 * the webhook delivery e2e coverage, this only asserts the CRUD/enqueue
 * path up to the queue, not the outbound SMTP call a real worker makes.
 */
describe('Report subscriptions (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let admin: { userId: string; cookies: string[] };
  let manager: { userId: string; cookies: string[] };
  let agent: { userId: string; cookies: string[] };
  let viewer: { userId: string; cookies: string[] };
  let senderAccount: SenderAccountSummary;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    usersRepository = app.get(UsersRepository);

    admin = await loginAsRole(app, usersRepository, 'admin');
    manager = await loginAsRole(app, usersRepository, 'manager');
    agent = await loginAsRole(app, usersRepository, 'agent');
    viewer = await loginAsRole(app, usersRepository, 'viewer');

    const senderResponse = await request(app.getHttpServer())
      .post('/sender-accounts')
      .set('Cookie', admin.cookies)
      .send({
        email: `reports-${randomUUID()}@example.com`,
        appPassword: 'zoho-app-password',
        displayName: 'Reports Sender',
      })
      .expect(201);
    senderAccount = senderResponse.body as SenderAccountSummary;
  });

  afterAll(async () => {
    await app.close();
  });

  function validSubscriptionPayload(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      name: `Weekly analytics ${randomUUID()}`,
      kind: 'analytics_pdf',
      format: 'pdf',
      cadence: 'weekly',
      dayOfWeek: 1,
      hourOfDay: 8,
      recipientEmails: ['ops@example.com'],
      senderAccountId: senderAccount.id,
      ...overrides,
    };
  }

  it('rejects agents and viewers from every report-subscriptions route', async () => {
    await request(app.getHttpServer())
      .get('/report-subscriptions')
      .set('Cookie', agent.cookies)
      .expect(403);
    await request(app.getHttpServer())
      .get('/report-subscriptions')
      .set('Cookie', viewer.cookies)
      .expect(403);
    await request(app.getHttpServer())
      .post('/report-subscriptions')
      .set('Cookie', agent.cookies)
      .send(validSubscriptionPayload())
      .expect(403);
  });

  it('rejects a format that does not match the report kind', async () => {
    await request(app.getHttpServer())
      .post('/report-subscriptions')
      .set('Cookie', admin.cookies)
      .send(validSubscriptionPayload({ kind: 'analytics_pdf', format: 'csv' }))
      .expect(400);
    await request(app.getHttpServer())
      .post('/report-subscriptions')
      .set('Cookie', admin.cookies)
      .send(
        validSubscriptionPayload({
          kind: 'sent_mail',
          format: 'pdf',
          dayOfWeek: undefined,
          cadence: 'daily',
        }),
      )
      .expect(400);
  });

  it('rejects weekly cadence without dayOfWeek and monthly without dayOfMonth', async () => {
    await request(app.getHttpServer())
      .post('/report-subscriptions')
      .set('Cookie', admin.cookies)
      .send(
        validSubscriptionPayload({ cadence: 'weekly', dayOfWeek: undefined }),
      )
      .expect(400);
    await request(app.getHttpServer())
      .post('/report-subscriptions')
      .set('Cookie', manager.cookies)
      .send(
        validSubscriptionPayload({
          cadence: 'monthly',
          dayOfWeek: undefined,
          dayOfMonth: undefined,
        }),
      )
      .expect(400);
  });

  it('rejects an unknown sender account', async () => {
    await request(app.getHttpServer())
      .post('/report-subscriptions')
      .set('Cookie', admin.cookies)
      .send(validSubscriptionPayload({ senderAccountId: randomUUID() }))
      .expect(404);
  });

  it('creates (as manager), lists, gets, updates, and deletes a subscription (as admin)', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/report-subscriptions')
      .set('Cookie', manager.cookies)
      .send(validSubscriptionPayload({ name: 'Weekly ops digest' }))
      .expect(201);
    const created = createResponse.body as ReportSubscriptionSummary;
    expect(created.createdBy).toBe(manager.userId);
    expect(created.isActive).toBe(true);
    expect(created.senderAccountEmail).toBe(senderAccount.email);
    expect(new Date(created.nextRunAt).getTime()).toBeGreaterThan(Date.now());

    const listResponse = await request(app.getHttpServer())
      .get('/report-subscriptions')
      .set('Cookie', admin.cookies)
      .expect(200);
    const list = listResponse.body as ReportSubscriptionSummary[];
    expect(list.some((item) => item.id === created.id)).toBe(true);

    const getResponse = await request(app.getHttpServer())
      .get(`/report-subscriptions/${created.id}`)
      .set('Cookie', admin.cookies)
      .expect(200);
    expect((getResponse.body as ReportSubscriptionSummary).name).toBe(
      'Weekly ops digest',
    );

    const updateResponse = await request(app.getHttpServer())
      .patch(`/report-subscriptions/${created.id}`)
      .set('Cookie', admin.cookies)
      .send({ isActive: false, cadence: 'daily', dayOfWeek: undefined })
      .expect(200);
    const updated = updateResponse.body as ReportSubscriptionSummary;
    expect(updated.isActive).toBe(false);
    expect(updated.cadence).toBe('daily');

    await request(app.getHttpServer())
      .delete(`/report-subscriptions/${created.id}`)
      .set('Cookie', admin.cookies)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/report-subscriptions/${created.id}`)
      .set('Cookie', admin.cookies)
      .expect(404);
  });

  it('rejects switching an existing daily subscription to weekly without a dayOfWeek', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/report-subscriptions')
      .set('Cookie', admin.cookies)
      .send(
        validSubscriptionPayload({
          cadence: 'daily',
          dayOfWeek: undefined,
          name: 'Daily sent-mail csv',
          kind: 'sent_mail',
          format: 'csv',
        }),
      )
      .expect(201);
    const created = createResponse.body as ReportSubscriptionSummary;

    await request(app.getHttpServer())
      .patch(`/report-subscriptions/${created.id}`)
      .set('Cookie', admin.cookies)
      .send({ cadence: 'weekly' })
      .expect(400);
  });

  it('accepts a manual run-now for an existing subscription and 404s for an unknown one', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/report-subscriptions')
      .set('Cookie', admin.cookies)
      .send(validSubscriptionPayload({ name: 'Run-now target' }))
      .expect(201);
    const created = createResponse.body as ReportSubscriptionSummary;

    await request(app.getHttpServer())
      .post(`/report-subscriptions/${created.id}/run-now`)
      .set('Cookie', manager.cookies)
      .expect(202);

    await request(app.getHttpServer())
      .post(`/report-subscriptions/${randomUUID()}/run-now`)
      .set('Cookie', admin.cookies)
      .expect(404);
  });
});
