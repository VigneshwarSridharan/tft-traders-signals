import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  ComposeSendResponse,
  CustomerSummary,
  EmailMessageSummary,
  ScheduledSendListResponse,
  SenderAccountSummary,
} from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';

describe('Scheduled sends (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let adminCookies: string[];
  let senderAccount: SenderAccountSummary;

  async function createCustomer(): Promise<CustomerSummary> {
    const response = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', adminCookies)
      .send({ name: 'Jane Doe', email: `jane-${randomUUID()}@example.com` })
      .expect(201);
    return response.body as CustomerSummary;
  }

  async function composeScheduled(
    customerId: string,
    scheduledFor: string,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', adminCookies)
      .field(
        'payload',
        JSON.stringify({
          senderAccountId: senderAccount.id,
          customerIds: [customerId],
          subject: 'Hi',
          bodyHtml: '<p>Hi</p>',
          scheduledFor,
          timezone: 'Asia/Kolkata',
        }),
      )
      .expect(201);
    const body = response.body as ComposeSendResponse;
    expect(body.results[0].ok).toBe(true);
    return body.results[0].messageId as string;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    usersRepository = app.get(UsersRepository);

    const email = `admin-${randomUUID()}@example.com`;
    const password = 'TestPass123!';
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    await usersRepository.create({
      email,
      name: 'Test admin',
      passwordHash,
      role: 'admin',
    });
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    adminCookies = loginResponse.get('Set-Cookie') ?? [];

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

  it('rejects a scheduledFor in the past', async () => {
    const customer = await createCustomer();

    const response = await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', adminCookies)
      .field(
        'payload',
        JSON.stringify({
          senderAccountId: senderAccount.id,
          customerIds: [customer.id],
          subject: 'Hi',
          bodyHtml: '<p>Hi</p>',
          scheduledFor: new Date(Date.now() - 60_000).toISOString(),
        }),
      )
      .expect(400);
    expect(JSON.stringify(response.body)).toContain('scheduledFor');
  });

  it('schedules a send, lists it, and dispatch never happens after cancel', async () => {
    const customer = await createCustomer();
    const scheduledFor = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const messageId = await composeScheduled(customer.id, scheduledFor);

    const getResponse = await request(app.getHttpServer())
      .get(`/email-messages/${messageId}`)
      .set('Cookie', adminCookies)
      .expect(200);
    expect((getResponse.body as EmailMessageSummary).status).toBe('scheduled');

    const listResponse = await request(app.getHttpServer())
      .get('/scheduled-sends')
      .set('Cookie', adminCookies)
      .expect(200);
    const list = listResponse.body as ScheduledSendListResponse;
    expect(list.items.some((item) => item.messageId === messageId)).toBe(true);

    await request(app.getHttpServer())
      .post(`/scheduled-sends/${messageId}/cancel`)
      .set('Cookie', adminCookies)
      .expect(200);

    const afterCancel = await request(app.getHttpServer())
      .get(`/email-messages/${messageId}`)
      .set('Cookie', adminCookies)
      .expect(200);
    expect((afterCancel.body as EmailMessageSummary).status).toBe('cancelled');

    const listAfterCancel = await request(app.getHttpServer())
      .get('/scheduled-sends')
      .set('Cookie', adminCookies)
      .expect(200);
    expect(
      (listAfterCancel.body as ScheduledSendListResponse).items.some(
        (item) => item.messageId === messageId,
      ),
    ).toBe(false);

    await request(app.getHttpServer())
      .post(`/scheduled-sends/${messageId}/cancel`)
      .set('Cookie', adminCookies)
      .expect(400);
  });

  it('reschedules a pending send to a new time', async () => {
    const customer = await createCustomer();
    const firstTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const messageId = await composeScheduled(customer.id, firstTime);

    const secondTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await request(app.getHttpServer())
      .post(`/scheduled-sends/${messageId}/reschedule`)
      .set('Cookie', adminCookies)
      .send({ scheduledFor: secondTime })
      .expect(200);

    const listResponse = await request(app.getHttpServer())
      .get('/scheduled-sends')
      .set('Cookie', adminCookies)
      .expect(200);
    const item = (listResponse.body as ScheduledSendListResponse).items.find(
      (candidate) => candidate.messageId === messageId,
    );
    expect(item?.scheduledFor).toBe(secondTime);
  });
});
