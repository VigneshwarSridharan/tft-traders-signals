import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  AuditLogListResponse,
  ComposeSendResponse,
  CustomerSummary,
  EmailTemplateSummary,
  SenderAccountSummary,
  TemplateCategorySummary,
} from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';
import { loginAsRole } from './helpers/auth';

describe('Audit logging (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let admin: { userId: string; cookies: string[] };
  let manager: string[];
  let agent: string[];
  let viewer: string[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    usersRepository = app.get(UsersRepository);

    admin = await loginAsRole(app, usersRepository, 'admin');
    manager = (await loginAsRole(app, usersRepository, 'manager')).cookies;
    agent = (await loginAsRole(app, usersRepository, 'agent')).cookies;
    viewer = (await loginAsRole(app, usersRepository, 'viewer')).cookies;
  });

  afterAll(async () => {
    await app.close();
  });

  async function fetchAuditLog(
    params: Record<string, string>,
  ): Promise<AuditLogListResponse> {
    const search = new URLSearchParams(params).toString();
    const response = await request(app.getHttpServer())
      .get(`/audit-logs?${search}`)
      .set('Cookie', admin.cookies)
      .expect(200);
    return response.body as AuditLogListResponse;
  }

  describe('access control', () => {
    it('only admin can read the audit log', async () => {
      await request(app.getHttpServer())
        .get('/audit-logs')
        .set('Cookie', admin.cookies)
        .expect(200);
      for (const cookies of [manager, agent, viewer]) {
        await request(app.getHttpServer())
          .get('/audit-logs')
          .set('Cookie', cookies)
          .expect(403);
      }
    });
  });

  it('auth.login is recorded on login', async () => {
    const response = await fetchAuditLog({
      userId: admin.userId,
      action: 'auth.login',
    });
    expect(response.items.length).toBeGreaterThan(0);
    expect(response.items[0].action).toBe('auth.login');
    expect(response.items[0].userId).toBe(admin.userId);
  });

  it('auth.logout is recorded on logout', async () => {
    const session = await loginAsRole(app, usersRepository, 'agent');
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', session.cookies)
      .expect(204);

    const response = await fetchAuditLog({
      userId: session.userId,
      action: 'auth.logout',
    });
    expect(response.items).toHaveLength(1);
    expect(response.items[0].entityId).toBe(session.userId);
  });

  it('template.create and template.delete are recorded', async () => {
    const categoryResponse = await request(app.getHttpServer())
      .post('/template-categories')
      .set('Cookie', admin.cookies)
      .send({ name: `Audit test ${randomUUID()}` })
      .expect(201);
    const category = categoryResponse.body as TemplateCategorySummary;

    const templateResponse = await request(app.getHttpServer())
      .post('/templates')
      .set('Cookie', admin.cookies)
      .send({
        categoryId: category.id,
        name: `Audit template ${randomUUID()}`,
        subject: 'Hi',
        bodyHtml: '<p>Hi</p>',
      })
      .expect(201);
    const template = templateResponse.body as EmailTemplateSummary;

    const createLog = await fetchAuditLog({
      action: 'template.create',
      entityId: template.id,
    });
    expect(createLog.items).toHaveLength(1);
    expect(createLog.items[0].entityType).toBe('template');
    expect(createLog.items[0].userId).toBe(admin.userId);

    await request(app.getHttpServer())
      .delete(`/templates/${template.id}`)
      .set('Cookie', admin.cookies)
      .expect(204);

    const deleteLog = await fetchAuditLog({
      action: 'template.delete',
      entityId: template.id,
    });
    expect(deleteLog.items).toHaveLength(1);
  });

  it('sender_account.create, .update, and .delete are recorded', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/sender-accounts')
      .set('Cookie', admin.cookies)
      .send({
        email: `audit-${randomUUID()}@example.com`,
        appPassword: 'zoho-app-password',
        displayName: 'Audit Sender',
      })
      .expect(201);
    const senderAccount = createResponse.body as SenderAccountSummary;

    await request(app.getHttpServer())
      .patch(`/sender-accounts/${senderAccount.id}`)
      .set('Cookie', admin.cookies)
      .send({ displayName: 'Renamed' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/sender-accounts/${senderAccount.id}`)
      .set('Cookie', admin.cookies)
      .expect(204);

    const [createLog, updateLog, deleteLog] = await Promise.all([
      fetchAuditLog({
        action: 'sender_account.create',
        entityId: senderAccount.id,
      }),
      fetchAuditLog({
        action: 'sender_account.update',
        entityId: senderAccount.id,
      }),
      fetchAuditLog({
        action: 'sender_account.delete',
        entityId: senderAccount.id,
      }),
    ]);
    expect(createLog.items).toHaveLength(1);
    expect(updateLog.items).toHaveLength(1);
    expect(deleteLog.items).toHaveLength(1);
  });

  it('message.send and suppression.override are recorded', async () => {
    const senderResponse = await request(app.getHttpServer())
      .post('/sender-accounts')
      .set('Cookie', admin.cookies)
      .send({
        email: `sales-${randomUUID()}@example.com`,
        appPassword: 'zoho-app-password',
        displayName: 'Sales',
      })
      .expect(201);
    const senderAccount = senderResponse.body as SenderAccountSummary;

    const customerEmail = `jane-${randomUUID()}@example.com`;
    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', admin.cookies)
      .send({ name: 'Jane Doe', email: customerEmail })
      .expect(201);
    const customer = customerResponse.body as CustomerSummary;

    const composeResponse = await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', admin.cookies)
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
    const messageId = (composeResponse.body as ComposeSendResponse).results[0]
      .messageId as string;

    const sendLog = await fetchAuditLog({
      action: 'message.send',
      entityId: messageId,
    });
    expect(sendLog.items).toHaveLength(1);
    expect(sendLog.items[0].userId).toBe(admin.userId);

    await request(app.getHttpServer())
      .post('/suppressions')
      .set('Cookie', admin.cookies)
      .send({ email: customerEmail })
      .expect(201);

    const overrideComposeResponse = await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', admin.cookies)
      .field(
        'payload',
        JSON.stringify({
          senderAccountId: senderAccount.id,
          customerIds: [customer.id],
          subject: 'Hi again',
          bodyHtml: '<p>Hi</p>',
          overrideSuppression: true,
        }),
      )
      .expect(201);
    const overriddenMessageId = (
      overrideComposeResponse.body as ComposeSendResponse
    ).results[0].messageId as string;
    expect(overriddenMessageId).toBeTruthy();

    const overrideLog = await fetchAuditLog({
      action: 'suppression.override',
      entityId: overriddenMessageId,
    });
    expect(overrideLog.items).toHaveLength(1);
  });

  it('customer.export is recorded', async () => {
    await request(app.getHttpServer())
      .get('/customers/export')
      .set('Cookie', admin.cookies)
      .expect(200);

    const response = await fetchAuditLog({
      userId: admin.userId,
      action: 'customer.export',
    });
    expect(response.items.length).toBeGreaterThan(0);
  });

  it('user.role_change is recorded when an admin changes a role, but not for unrelated updates', async () => {
    const target = await loginAsRole(app, usersRepository, 'viewer');

    await request(app.getHttpServer())
      .patch(`/users/${target.userId}`)
      .set('Cookie', admin.cookies)
      .send({ name: 'Renamed Viewer' })
      .expect(200);

    const unrelatedLog = await fetchAuditLog({
      action: 'user.role_change',
      entityId: target.userId,
    });
    expect(unrelatedLog.items).toHaveLength(0);

    await request(app.getHttpServer())
      .patch(`/users/${target.userId}`)
      .set('Cookie', admin.cookies)
      .send({ role: 'agent' })
      .expect(200);

    const roleChangeLog = await fetchAuditLog({
      action: 'user.role_change',
      entityId: target.userId,
    });
    expect(roleChangeLog.items).toHaveLength(1);
    expect(roleChangeLog.items[0].metadata).toEqual({
      from: 'viewer',
      to: 'agent',
    });
    expect(roleChangeLog.items[0].userId).toBe(admin.userId);
  });

  it('pagination and user metadata are populated correctly', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit-logs?pageSize=5&page=1')
      .set('Cookie', admin.cookies)
      .expect(200);
    const body = response.body as AuditLogListResponse;
    expect(body.items.length).toBeLessThanOrEqual(5);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(5);
    expect(body.total).toBeGreaterThan(0);

    const withUser = body.items.find((item) => item.userId);
    if (withUser) {
      expect(typeof withUser.userEmail).toBe('string');
    }
  });
});
