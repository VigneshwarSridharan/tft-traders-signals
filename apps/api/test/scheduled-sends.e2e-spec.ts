import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { Queue } from 'bullmq';
import type { Pool } from 'pg';
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
import { PG_POOL } from './../src/database/database.constants';
import {
  SEND_QUEUE_NAME,
  type SendJobData,
} from './../src/send/send-queue.service';
import { parseRedisConnectionOptions } from './../src/send/redis-connection.util';

describe('Scheduled sends (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let pool: Pool;
  let inspectionQueue: Queue<SendJobData>;
  let adminCookies: string[];
  let agentCookies: string[];
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

  async function createCustomer(): Promise<CustomerSummary> {
    const response = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', adminCookies)
      .send({
        name: 'Jane Doe',
        email: `jane-${randomUUID()}@example.com`,
      })
      .expect(201);
    return response.body as CustomerSummary;
  }

  async function composeScheduled(
    customer: CustomerSummary,
    scheduledFor: Date,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', agentCookies)
      .field(
        'payload',
        JSON.stringify({
          senderAccountId: senderAccount.id,
          customerIds: [customer.id],
          subject: 'Scheduled hello',
          bodyHtml: '<p>Hi {{customer.name}}</p>',
          scheduledFor: scheduledFor.toISOString(),
          timezone: 'UTC',
        }),
      )
      .expect(201);
    const body = response.body as ComposeSendResponse;
    expect(body.results[0].ok).toBe(true);
    return body.results[0].messageId as string;
  }

  async function getMessage(messageId: string): Promise<EmailMessageSummary> {
    const response = await request(app.getHttpServer())
      .get(`/email-messages/${messageId}`)
      .set('Cookie', agentCookies)
      .expect(200);
    return response.body as EmailMessageSummary;
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

    // A second, independent connection to the same queue — standing in for
    // "another process" (e.g. a freshly restarted worker) that only has
    // Redis to go on, no in-memory state from the API process.
    inspectionQueue = new Queue<SendJobData>(SEND_QUEUE_NAME, {
      connection: parseRedisConnectionOptions(process.env.REDIS_URL as string),
    });

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
    await inspectionQueue.close();
    await app.close();
  });

  it('rejects a scheduledFor in the past', async () => {
    const customer = await createCustomer();
    await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', agentCookies)
      .field(
        'payload',
        JSON.stringify({
          senderAccountId: senderAccount.id,
          customerIds: [customer.id],
          subject: 'Too late',
          bodyHtml: '<p>Hi</p>',
          scheduledFor: new Date(Date.now() - 60_000).toISOString(),
        }),
      )
      .expect(400);
  });

  it('creates a message in `scheduled` status with a matching delayed BullMQ job, and lists it in the queue screen', async () => {
    const customer = await createCustomer();
    const scheduledFor = new Date(Date.now() + 60 * 60 * 1000);
    const messageId = await composeScheduled(customer, scheduledFor);

    const message = await getMessage(messageId);
    expect(message.status).toBe('scheduled');

    const listResponse = await request(app.getHttpServer())
      .get('/scheduled-sends')
      .set('Cookie', agentCookies)
      .expect(200);
    const list = listResponse.body as ScheduledSendListResponse;
    const item = list.items.find((entry) => entry.messageId === messageId);
    expect(item).toBeDefined();
    expect(new Date(item?.scheduledFor as string).getTime()).toBe(
      scheduledFor.getTime(),
    );

    // The delayed job is reachable from a separate Redis connection — i.e.
    // it lives in Redis, not in the API process's memory, so a worker
    // restart wouldn't drop it.
    const job = await inspectionQueue.getJob(`scheduled-${messageId}`);
    expect(job).toBeDefined();
    expect(job?.data.messageId).toBe(messageId);
    const remainingDelay = job ? job.timestamp + job.delay - Date.now() : 0;
    expect(remainingDelay).toBeGreaterThan(55 * 60 * 1000);
    expect(remainingDelay).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it('never fires the delayed job once a schedule is cancelled', async () => {
    const customer = await createCustomer();
    const scheduledFor = new Date(Date.now() + 60 * 60 * 1000);
    const messageId = await composeScheduled(customer, scheduledFor);

    await request(app.getHttpServer())
      .delete(`/scheduled-sends/${messageId}`)
      .set('Cookie', agentCookies)
      .expect(200);

    const cancelledMessage = await getMessage(messageId);
    expect(cancelledMessage.status).toBe('cancelled');

    const listResponse = await request(app.getHttpServer())
      .get('/scheduled-sends')
      .set('Cookie', agentCookies)
      .expect(200);
    const list = listResponse.body as ScheduledSendListResponse;
    expect(list.items.some((entry) => entry.messageId === messageId)).toBe(
      false,
    );

    const job = await inspectionQueue.getJob(`scheduled-${messageId}`);
    expect(job).toBeUndefined();
  });

  it('reschedules a message: removes the old delayed job and adds a new one for the new time', async () => {
    const customer = await createCustomer();
    const originalTime = new Date(Date.now() + 60 * 60 * 1000);
    const messageId = await composeScheduled(customer, originalTime);

    const newTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await request(app.getHttpServer())
      .patch(`/scheduled-sends/${messageId}`)
      .set('Cookie', agentCookies)
      .send({ scheduledFor: newTime.toISOString(), timezone: 'UTC' })
      .expect(200);

    const listResponse = await request(app.getHttpServer())
      .get('/scheduled-sends')
      .set('Cookie', agentCookies)
      .expect(200);
    const list = listResponse.body as ScheduledSendListResponse;
    const item = list.items.find((entry) => entry.messageId === messageId);
    expect(new Date(item?.scheduledFor as string).getTime()).toBe(
      newTime.getTime(),
    );

    const job = await inspectionQueue.getJob(`scheduled-${messageId}`);
    expect(job).toBeDefined();
    const remainingDelay = job ? job.timestamp + job.delay - Date.now() : 0;
    expect(remainingDelay).toBeGreaterThan(115 * 60 * 1000);
    expect(remainingDelay).toBeLessThanOrEqual(120 * 60 * 1000);
  });

  it('rejects reschedule/cancel once a message has left the scheduled state', async () => {
    const customer = await createCustomer();
    const scheduledFor = new Date(Date.now() + 60 * 60 * 1000);
    const messageId = await composeScheduled(customer, scheduledFor);

    // Simulate the send worker having already dispatched it — no real
    // worker runs in this test process (see email-sender.service.spec.ts
    // for full send-path coverage with a mocked transporter).
    await pool.query(
      `UPDATE email_messages SET status = 'sent' WHERE id = $1`,
      [messageId],
    );

    await request(app.getHttpServer())
      .delete(`/scheduled-sends/${messageId}`)
      .set('Cookie', agentCookies)
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/scheduled-sends/${messageId}`)
      .set('Cookie', agentCookies)
      .send({ scheduledFor: new Date(Date.now() + 60_000).toISOString() })
      .expect(400);
  });
});
