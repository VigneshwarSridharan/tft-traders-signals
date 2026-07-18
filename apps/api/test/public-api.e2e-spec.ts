import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  ComposeSendResponse,
  CreateApiKeyResponse,
  CustomerSummary,
  EmailMessageSummary,
  SenderAccountSummary,
  SentMailListResponse,
} from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';
import { loginAsRole } from './helpers/auth';

/**
 * Task 23 — public REST API (/v1/*): a script authenticates with an API key
 * (not the dashboard's JWT cookie), sends a tracked email, and polls its
 * status. Also covers scope enforcement and revoked/expired key rejection.
 */
describe('Public API (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let admin: { userId: string; cookies: string[] };
  let agent: { userId: string; cookies: string[] };
  let senderAccount: SenderAccountSummary;
  let customer: CustomerSummary;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    usersRepository = app.get(UsersRepository);

    admin = await loginAsRole(app, usersRepository, 'admin');
    agent = await loginAsRole(app, usersRepository, 'agent');

    const senderResponse = await request(app.getHttpServer())
      .post('/sender-accounts')
      .set('Cookie', admin.cookies)
      .send({
        email: `sales-${randomUUID()}@example.com`,
        appPassword: 'zoho-app-password',
        displayName: 'Sales Team',
      })
      .expect(201);
    senderAccount = senderResponse.body as SenderAccountSummary;

    const customerResponse = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', admin.cookies)
      .send({ name: 'Jane Doe', email: `jane-${randomUUID()}@example.com` })
      .expect(201);
    customer = customerResponse.body as CustomerSummary;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createApiKey(
    cookies: string[],
    scopes: string[],
    expiresAt?: string,
  ): Promise<CreateApiKeyResponse> {
    const response = await request(app.getHttpServer())
      .post('/api-keys')
      .set('Cookie', cookies)
      .send({ name: `Test key ${randomUUID()}`, scopes, expiresAt })
      .expect(201);
    return response.body as CreateApiKeyResponse;
  }

  it('rejects a request with no Authorization header', async () => {
    await request(app.getHttpServer()).get('/v1/messages').expect(401);
  });

  it('rejects a bearer token that is not a known API key', async () => {
    await request(app.getHttpServer())
      .get('/v1/messages')
      .set('Authorization', 'Bearer sk_live_not_a_real_key')
      .expect(401);
  });

  it('serves the OpenAPI spec and docs page without authentication', async () => {
    const openapiResponse = await request(app.getHttpServer())
      .get('/v1/openapi.json')
      .expect(200);
    const openapi = openapiResponse.body as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(openapi.openapi).toBe('3.0.3');
    expect(openapi.paths['/v1/send']).toBeDefined();

    const docsResponse = await request(app.getHttpServer())
      .get('/v1/docs')
      .expect(200);
    expect(docsResponse.headers['content-type']).toContain('text/html');
    expect(docsResponse.text).toContain('swagger-ui');
  });

  it('sends a tracked email and polls its status via an API key with the send/read:messages scopes', async () => {
    const apiKey = await createApiKey(agent.cookies, ['send', 'read:messages']);
    expect(apiKey.secret).toMatch(/^sk_live_/);

    const sendResponse = await request(app.getHttpServer())
      .post('/v1/send')
      .set('Authorization', `Bearer ${apiKey.secret}`)
      .send({
        senderAccountId: senderAccount.id,
        customerIds: [customer.id],
        subject: 'Hello from the public API',
        bodyHtml: '<p>Hi {{customer.name}}</p>',
      })
      .expect(201);
    const sendBody = sendResponse.body as ComposeSendResponse;
    expect(sendBody.results).toHaveLength(1);
    expect(sendBody.results[0].ok).toBe(true);
    const messageId = sendBody.results[0].messageId as string;
    expect(messageId).toBeTruthy();

    const messageResponse = await request(app.getHttpServer())
      .get(`/v1/messages/${messageId}`)
      .set('Authorization', `Bearer ${apiKey.secret}`)
      .expect(200);
    const message = messageResponse.body as EmailMessageSummary;
    expect(message.id).toBe(messageId);
    expect(message.status).toBe('queued');

    const listResponse = await request(app.getHttpServer())
      .get('/v1/messages')
      .set('Authorization', `Bearer ${apiKey.secret}`)
      .expect(200);
    const listBody = listResponse.body as SentMailListResponse;
    expect(listBody.items.some((item) => item.id === messageId)).toBe(true);
  });

  it('rejects a request using a revoked key', async () => {
    const apiKey = await createApiKey(agent.cookies, ['read:messages']);

    await request(app.getHttpServer())
      .get('/v1/messages')
      .set('Authorization', `Bearer ${apiKey.secret}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api-keys/${apiKey.id}`)
      .set('Cookie', agent.cookies)
      .expect(204);

    await request(app.getHttpServer())
      .get('/v1/messages')
      .set('Authorization', `Bearer ${apiKey.secret}`)
      .expect(401);
  });

  it('rejects a request using an already-expired key', async () => {
    const apiKey = await createApiKey(
      agent.cookies,
      ['read:messages'],
      new Date(Date.now() - 60_000).toISOString(),
    );

    await request(app.getHttpServer())
      .get('/v1/messages')
      .set('Authorization', `Bearer ${apiKey.secret}`)
      .expect(401);
  });

  it('rejects /v1/send for a key without the send scope (403, not 401)', async () => {
    const apiKey = await createApiKey(agent.cookies, ['read:messages']);

    await request(app.getHttpServer())
      .post('/v1/send')
      .set('Authorization', `Bearer ${apiKey.secret}`)
      .send({
        senderAccountId: senderAccount.id,
        customerIds: [customer.id],
        subject: 'Should be blocked',
        bodyHtml: '<p>Nope</p>',
      })
      .expect(403);
  });

  it('rejects a read:templates-scoped key from writing templates', async () => {
    const apiKey = await createApiKey(admin.cookies, ['read:templates']);

    await request(app.getHttpServer())
      .get('/v1/templates')
      .set('Authorization', `Bearer ${apiKey.secret}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/templates')
      .set('Authorization', `Bearer ${apiKey.secret}`)
      .send({
        categoryId: randomUUID(),
        name: 'Should be blocked',
        subject: 'x',
        bodyHtml: '<p>x</p>',
      })
      .expect(403);
  });

  it('a non-admin only sees their own keys; an admin sees everyone’s', async () => {
    await createApiKey(agent.cookies, ['read:messages']);

    const agentListResponse = await request(app.getHttpServer())
      .get('/api-keys')
      .set('Cookie', agent.cookies)
      .expect(200);
    const agentKeys = agentListResponse.body as CreateApiKeyResponse[];
    expect(agentKeys.every((key) => key.userId === agent.userId)).toBe(true);

    const adminListResponse = await request(app.getHttpServer())
      .get('/api-keys')
      .set('Cookie', admin.cookies)
      .expect(200);
    const adminKeys = adminListResponse.body as CreateApiKeyResponse[];
    expect(adminKeys.some((key) => key.userId === agent.userId)).toBe(true);
  });

  it('a non-admin cannot revoke another user’s key (404, not 403)', async () => {
    const otherAgent = await loginAsRole(app, usersRepository, 'agent');
    const apiKey = await createApiKey(otherAgent.cookies, ['read:messages']);

    await request(app.getHttpServer())
      .delete(`/api-keys/${apiKey.id}`)
      .set('Cookie', agent.cookies)
      .expect(404);
  });

  it('rejects creating an API key with an empty scopes array', async () => {
    await request(app.getHttpServer())
      .post('/api-keys')
      .set('Cookie', agent.cookies)
      .send({ name: 'No scopes', scopes: [] })
      .expect(400);
  });
});
