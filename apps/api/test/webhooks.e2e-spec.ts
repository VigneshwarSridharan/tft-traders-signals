import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  ComposeSendResponse,
  CreateWebhookEndpointResponse,
  CustomerSummary,
  EmailMessageSummary,
  SenderAccountSummary,
  WebhookDeliveryListResponse,
  WebhookEndpointSummary,
} from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';
import { loginAsRole } from './helpers/auth';

/**
 * Task 23 — outbound webhooks: endpoint CRUD (admin-only) plus the dispatch
 * path (endpoint -> webhook_deliveries row -> BullMQ enqueue). The delivery
 * *worker* itself (the actual signed HTTP POST) isn't exercised here — like
 * the send pipeline's e2e coverage, this only asserts the CRUD/enqueue path
 * up to the queue, not the outbound network call a real worker process makes.
 */
describe('Webhooks (e2e)', () => {
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

  it('rejects non-admins from every webhook-endpoints route', async () => {
    await request(app.getHttpServer())
      .get('/webhook-endpoints')
      .set('Cookie', agent.cookies)
      .expect(403);
    await request(app.getHttpServer())
      .post('/webhook-endpoints')
      .set('Cookie', agent.cookies)
      .send({ url: 'https://example.com/hook', events: ['sent'] })
      .expect(403);
  });

  it('rejects a non-https, non-localhost URL', async () => {
    await request(app.getHttpServer())
      .post('/webhook-endpoints')
      .set('Cookie', admin.cookies)
      .send({ url: 'http://example.com/hook', events: ['sent'] })
      .expect(400);
  });

  it('creates an endpoint, shows the raw secret once, and never exposes it again', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/webhook-endpoints')
      .set('Cookie', admin.cookies)
      .send({
        url: 'https://example.com/hook',
        events: ['sent', 'unsubscribed'],
      })
      .expect(201);
    const created = createResponse.body as CreateWebhookEndpointResponse;
    expect(created.secret).toMatch(/^whsec_/);

    const listResponse = await request(app.getHttpServer())
      .get('/webhook-endpoints')
      .set('Cookie', admin.cookies)
      .expect(200);
    const endpoints = listResponse.body as WebhookEndpointSummary[];
    const found = endpoints.find((endpoint) => endpoint.id === created.id);
    expect(found).toBeDefined();
    expect(found).not.toHaveProperty('secret');
    expect(found).not.toHaveProperty('secret_enc');
    expect(JSON.stringify(listResponse.body)).not.toContain(created.secret);
  });

  it('updates (url/events/isActive) and deletes an endpoint', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/webhook-endpoints')
      .set('Cookie', admin.cookies)
      .send({ url: 'https://example.com/hook-2', events: ['sent'] })
      .expect(201);
    const endpoint = createResponse.body as CreateWebhookEndpointResponse;

    const updateResponse = await request(app.getHttpServer())
      .patch(`/webhook-endpoints/${endpoint.id}`)
      .set('Cookie', admin.cookies)
      .send({ isActive: false, events: ['sent', 'bounced'] })
      .expect(200);
    const updated = updateResponse.body as WebhookEndpointSummary;
    expect(updated.isActive).toBe(false);
    expect(updated.events.sort()).toEqual(['bounced', 'sent']);

    await request(app.getHttpServer())
      .delete(`/webhook-endpoints/${endpoint.id}`)
      .set('Cookie', admin.cookies)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/webhook-endpoints/${endpoint.id}`)
      .set('Cookie', admin.cookies)
      .expect(404);
  });

  it('fires a test delivery (bypassing the subscription filter) that shows up in the delivery log', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/webhook-endpoints')
      .set('Cookie', admin.cookies)
      .send({ url: 'https://example.com/hook-test', events: ['bounced'] }) // not subscribed to 'sent'
      .expect(201);
    const endpoint = createResponse.body as CreateWebhookEndpointResponse;

    await request(app.getHttpServer())
      .post(`/webhook-endpoints/${endpoint.id}/test-send`)
      .set('Cookie', admin.cookies)
      .expect(202);

    const deliveriesResponse = await request(app.getHttpServer())
      .get(`/webhook-endpoints/${endpoint.id}/deliveries`)
      .set('Cookie', admin.cookies)
      .expect(200);
    const deliveries = deliveriesResponse.body as WebhookDeliveryListResponse;
    expect(deliveries.total).toBe(1);
    expect(deliveries.items[0].eventType).toBe('sent');
    expect(deliveries.items[0].attempt).toBe(1);
    expect(deliveries.items[0].delivered).toBe(false);
  });

  it('dispatches a real "unsubscribed" event to a subscribed endpoint via the unsubscribe pipeline', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/webhook-endpoints')
      .set('Cookie', admin.cookies)
      .send({
        url: 'https://example.com/hook-unsub',
        events: ['unsubscribed'],
      })
      .expect(201);
    const endpoint = createResponse.body as CreateWebhookEndpointResponse;

    const composeResponse = await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', admin.cookies)
      .field(
        'payload',
        JSON.stringify({
          senderAccountId: senderAccount.id,
          customerIds: [customer.id],
          subject: 'Newsletter',
          bodyHtml: '<p>Hi {{customer.name}}</p>',
        }),
      )
      .expect(201);
    const composeBody = composeResponse.body as ComposeSendResponse;
    const messageId = composeBody.results[0].messageId as string;

    const messageResponse = await request(app.getHttpServer())
      .get(`/email-messages/${messageId}`)
      .set('Cookie', admin.cookies)
      .expect(200);
    const message = messageResponse.body as EmailMessageSummary;

    await request(app.getHttpServer())
      .post(`/u/${message.publicToken}`)
      .expect(200);

    const deliveriesResponse = await request(app.getHttpServer())
      .get(`/webhook-endpoints/${endpoint.id}/deliveries`)
      .set('Cookie', admin.cookies)
      .expect(200);
    const deliveries = deliveriesResponse.body as WebhookDeliveryListResponse;
    expect(
      deliveries.items.some((item) => item.eventType === 'unsubscribed'),
    ).toBe(true);

    // Idempotent re-unsubscribe (repeat one-click POST) must not fire a
    // second webhook delivery for the same event.
    await request(app.getHttpServer())
      .post(`/u/${message.publicToken}`)
      .expect(200);
    const secondDeliveriesResponse = await request(app.getHttpServer())
      .get(`/webhook-endpoints/${endpoint.id}/deliveries`)
      .set('Cookie', admin.cookies)
      .expect(200);
    const secondDeliveries =
      secondDeliveriesResponse.body as WebhookDeliveryListResponse;
    expect(secondDeliveries.total).toBe(deliveries.total);
  });
});
