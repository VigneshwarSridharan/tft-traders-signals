import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  ComposeSendResponse,
  CustomerSummary,
  EmailTemplateSummary,
  ScheduledSendListResponse,
  SenderAccountSummary,
  SentMailListResponse,
  TemplateCategorySummary,
} from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';
import { loginAsRole } from './helpers/auth';

/**
 * Endpoint-level permission matrix for Task 19 (docs/PERMISSIONS.md):
 * admin has full access; manager sends + manages templates/customers/tags
 * and views all analytics; agent sends and sees only what they created;
 * viewer is read-only everywhere and cannot send.
 */
describe('RBAC & multi-user hardening (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let admin: string[];
  let manager: string[];
  let agentA: { userId: string; cookies: string[] };
  let agentB: { userId: string; cookies: string[] };
  let viewer: string[];
  let senderAccount: SenderAccountSummary;
  let category: TemplateCategorySummary;
  let template: EmailTemplateSummary;
  let customer: CustomerSummary;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    usersRepository = app.get(UsersRepository);

    admin = (await loginAsRole(app, usersRepository, 'admin')).cookies;
    manager = (await loginAsRole(app, usersRepository, 'manager')).cookies;
    agentA = await loginAsRole(app, usersRepository, 'agent');
    agentB = await loginAsRole(app, usersRepository, 'agent');
    viewer = (await loginAsRole(app, usersRepository, 'viewer')).cookies;

    const senderResponse = await request(app.getHttpServer())
      .post('/sender-accounts')
      .set('Cookie', admin)
      .send({
        email: `sales-${randomUUID()}@example.com`,
        appPassword: 'zoho-app-password',
        displayName: 'Sales Team',
      })
      .expect(201);
    senderAccount = senderResponse.body as SenderAccountSummary;

    const categoryResponse = await request(app.getHttpServer())
      .post('/template-categories')
      .set('Cookie', admin)
      .send({ name: `Quotation ${randomUUID()}` })
      .expect(201);
    category = categoryResponse.body as TemplateCategorySummary;

    const templateResponse = await request(app.getHttpServer())
      .post('/templates')
      .set('Cookie', admin)
      .send({
        categoryId: category.id,
        name: `Quote ${randomUUID()}`,
        subject: 'Your quote',
        bodyHtml: '<p>Hi {{customer.name}}</p>',
      })
      .expect(201);
    template = templateResponse.body as EmailTemplateSummary;

    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', admin)
      .send({ name: 'Jane Doe', email: `jane-${randomUUID()}@example.com` })
      .expect(201);
    customer = customerResponse.body as CustomerSummary;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('admin-only setup resources', () => {
    it.each([
      ['GET', '/users'],
      ['GET', '/sender-accounts'],
      ['GET', '/suppressions'],
    ] as const)('%s %s: only admin is allowed', async (method, path) => {
      await request(app.getHttpServer())
        [method.toLowerCase() as 'get'](path)
        .set('Cookie', admin)
        .expect(200);
      for (const cookies of [manager, agentA.cookies, viewer]) {
        await request(app.getHttpServer())
          [method.toLowerCase() as 'get'](path)
          .set('Cookie', cookies)
          .expect(403);
      }
    });

    it('only admin can create a custom field definition; everyone can read them', async () => {
      for (const cookies of [manager, agentA.cookies, viewer]) {
        await request(app.getHttpServer())
          .post('/custom-field-defs')
          .set('Cookie', cookies)
          .send({
            key: `f_${randomUUID().slice(0, 8)}`,
            label: 'F',
            fieldType: 'text',
          })
          .expect(403);
      }
      await request(app.getHttpServer())
        .post('/custom-field-defs')
        .set('Cookie', admin)
        .send({
          key: `f_${randomUUID().slice(0, 8)}`,
          label: 'F',
          fieldType: 'text',
        })
        .expect(201);

      for (const cookies of [admin, manager, agentA.cookies, viewer]) {
        await request(app.getHttpServer())
          .get('/custom-field-defs')
          .set('Cookie', cookies)
          .expect(200);
      }
    });

    it('only admin can create a template category; everyone can read them', async () => {
      for (const cookies of [manager, agentA.cookies, viewer]) {
        await request(app.getHttpServer())
          .post('/template-categories')
          .set('Cookie', cookies)
          .send({ name: `Should fail ${randomUUID()}` })
          .expect(403);
      }
      for (const cookies of [admin, manager, agentA.cookies, viewer]) {
        await request(app.getHttpServer())
          .get('/template-categories')
          .set('Cookie', cookies)
          .expect(200);
      }
    });
  });

  describe('templates: admin/manager manage, everyone reads', () => {
    it('agent and viewer cannot create or delete templates', async () => {
      for (const cookies of [agentA.cookies, viewer]) {
        await request(app.getHttpServer())
          .post('/templates')
          .set('Cookie', cookies)
          .send({
            categoryId: category.id,
            name: `Nope ${randomUUID()}`,
            subject: 'x',
            bodyHtml: '<p>x</p>',
          })
          .expect(403);
        await request(app.getHttpServer())
          .delete(`/templates/${template.id}`)
          .set('Cookie', cookies)
          .expect(403);
      }
    });

    it('manager can create templates', async () => {
      await request(app.getHttpServer())
        .post('/templates')
        .set('Cookie', manager)
        .send({
          categoryId: category.id,
          name: `Manager template ${randomUUID()}`,
          subject: 'x',
          bodyHtml: '<p>x</p>',
        })
        .expect(201);
    });

    it('every role can read the template list', async () => {
      for (const cookies of [admin, manager, agentA.cookies, viewer]) {
        await request(app.getHttpServer())
          .get('/templates')
          .set('Cookie', cookies)
          .expect(200);
      }
    });
  });

  describe('customers: admin/manager manage, everyone reads', () => {
    it('agent and viewer cannot create, update, delete, or export customers', async () => {
      for (const cookies of [agentA.cookies, viewer]) {
        await request(app.getHttpServer())
          .post('/customers')
          .set('Cookie', cookies)
          .send({ name: 'X', email: `x-${randomUUID()}@example.com` })
          .expect(403);
        await request(app.getHttpServer())
          .patch(`/customers/${customer.id}`)
          .set('Cookie', cookies)
          .send({ name: 'Renamed' })
          .expect(403);
        await request(app.getHttpServer())
          .get('/customers/export')
          .set('Cookie', cookies)
          .expect(403);
      }
    });

    it('every role can read the customer list', async () => {
      for (const cookies of [admin, manager, agentA.cookies, viewer]) {
        await request(app.getHttpServer())
          .get('/customers')
          .set('Cookie', cookies)
          .expect(200);
      }
    });
  });

  describe('tags: admin/manager manage, everyone reads', () => {
    it('agent and viewer cannot create tags', async () => {
      for (const cookies of [agentA.cookies, viewer]) {
        await request(app.getHttpServer())
          .post('/tags')
          .set('Cookie', cookies)
          .send({ name: `Nope ${randomUUID()}` })
          .expect(403);
      }
    });

    it('manager can create tags', async () => {
      await request(app.getHttpServer())
        .post('/tags')
        .set('Cookie', manager)
        .send({ name: `Manager tag ${randomUUID()}` })
        .expect(201);
    });
  });

  describe('sending: admin/manager/agent can send, viewer cannot', () => {
    it('viewer is rejected from compose and test-send', async () => {
      await request(app.getHttpServer())
        .post('/email-messages/compose')
        .set('Cookie', viewer)
        .field(
          'payload',
          JSON.stringify({
            senderAccountId: senderAccount.id,
            customerIds: [customer.id],
            subject: 'Hi',
            bodyHtml: '<p>Hi</p>',
          }),
        )
        .expect(403);
    });

    it('agent can compose', async () => {
      const response = await request(app.getHttpServer())
        .post('/email-messages/compose')
        .set('Cookie', agentA.cookies)
        .field(
          'payload',
          JSON.stringify({
            senderAccountId: senderAccount.id,
            customerIds: [customer.id],
            subject: 'Hi from agent A',
            bodyHtml: '<p>Hi</p>',
          }),
        )
        .expect(201);
      const body = response.body as ComposeSendResponse;
      expect(body.results[0].ok).toBe(true);
    });
  });

  describe('ownership scoping: agents see and manage only their own sends', () => {
    let agentAMessageId: string;
    let agentBMessageId: string;

    beforeAll(async () => {
      const composeAs = async (cookies: string[], subject: string) => {
        const response = await request(app.getHttpServer())
          .post('/email-messages/compose')
          .set('Cookie', cookies)
          .field(
            'payload',
            JSON.stringify({
              senderAccountId: senderAccount.id,
              customerIds: [customer.id],
              subject,
              bodyHtml: '<p>Hi</p>',
            }),
          )
          .expect(201);
        return (response.body as ComposeSendResponse).results[0]
          .messageId as string;
      };
      agentAMessageId = await composeAs(agentA.cookies, 'Owned by agent A');
      agentBMessageId = await composeAs(agentB.cookies, 'Owned by agent B');
    });

    it("agent's sent-mail list excludes other agents' messages", async () => {
      const response = await request(app.getHttpServer())
        .get('/sent-mail?pageSize=100')
        .set('Cookie', agentA.cookies)
        .expect(200);
      const ids = (response.body as SentMailListResponse).items.map(
        (item) => item.id,
      );
      expect(ids).toContain(agentAMessageId);
      expect(ids).not.toContain(agentBMessageId);
    });

    it("admin's and manager's sent-mail list includes every agent's messages", async () => {
      for (const cookies of [admin, manager, viewer]) {
        const response = await request(app.getHttpServer())
          .get('/sent-mail?pageSize=100')
          .set('Cookie', cookies)
          .expect(200);
        const ids = (response.body as SentMailListResponse).items.map(
          (item) => item.id,
        );
        expect(ids).toContain(agentAMessageId);
        expect(ids).toContain(agentBMessageId);
      }
    });

    it("an agent gets 404 (not 403) fetching another agent's message by ID", async () => {
      await request(app.getHttpServer())
        .get(`/sent-mail/${agentBMessageId}?includeBotEvents=false`)
        .set('Cookie', agentA.cookies)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/sent-mail/${agentAMessageId}?includeBotEvents=false`)
        .set('Cookie', agentA.cookies)
        .expect(200);
    });

    it("an agent cannot reach another agent's scheduled send", async () => {
      const scheduledFor = new Date(Date.now() + 60 * 60 * 1000);
      const scheduleResponse = await request(app.getHttpServer())
        .post('/email-messages/compose')
        .set('Cookie', agentB.cookies)
        .field(
          'payload',
          JSON.stringify({
            senderAccountId: senderAccount.id,
            customerIds: [customer.id],
            subject: 'Scheduled by agent B',
            bodyHtml: '<p>Hi</p>',
            scheduledFor: scheduledFor.toISOString(),
          }),
        )
        .expect(201);
      const scheduledMessageId = (scheduleResponse.body as ComposeSendResponse)
        .results[0].messageId as string;

      const listResponse = await request(app.getHttpServer())
        .get('/scheduled-sends?pageSize=100')
        .set('Cookie', agentA.cookies)
        .expect(200);
      const ids = (listResponse.body as ScheduledSendListResponse).items.map(
        (item) => item.messageId,
      );
      expect(ids).not.toContain(scheduledMessageId);

      await request(app.getHttpServer())
        .delete(`/scheduled-sends/${scheduledMessageId}`)
        .set('Cookie', agentA.cookies)
        .expect(404);

      await request(app.getHttpServer())
        .delete(`/scheduled-sends/${scheduledMessageId}`)
        .set('Cookie', agentB.cookies)
        .expect(200);
    });

    it('viewer cannot list or manage scheduled sends', async () => {
      await request(app.getHttpServer())
        .get('/scheduled-sends')
        .set('Cookie', viewer)
        .expect(403);
    });
  });

  describe('analytics: admin/manager/viewer view everything, agent has no aggregate dashboard access', () => {
    it.each(['/analytics/kpis', '/analytics/timeseries', '/analytics/heatmap'])(
      'agent is rejected from %s',
      async (path) => {
        await request(app.getHttpServer())
          .get(path)
          .set('Cookie', agentA.cookies)
          .expect(403);
      },
    );

    it('admin, manager, and viewer can read KPIs', async () => {
      for (const cookies of [admin, manager, viewer]) {
        await request(app.getHttpServer())
          .get('/analytics/kpis')
          .set('Cookie', cookies)
          .expect(200);
      }
    });
  });
});
