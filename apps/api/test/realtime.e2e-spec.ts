import { randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
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
  RealtimeTrackingEvent,
  SenderAccountSummary,
} from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';
import { TrackingEventProcessorService } from './../src/tracking/tracking-event-processor.service';
import { RealtimeEventsService } from './../src/realtime/realtime-events.service';

describe('Realtime (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let processor: TrackingEventProcessorService;
  let realtimeEventsService: RealtimeEventsService;
  let baseUrl: string;
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

  async function composeTrackedMessage(): Promise<EmailMessageSummary> {
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
          bodyHtml: '<p>Hi, here is your quote.</p>',
        }),
      )
      .expect(201);
    const messageId = (composeResponse.body as ComposeSendResponse).results[0]
      .messageId as string;

    const getResponse = await request(app.getHttpServer())
      .get(`/email-messages/${messageId}`)
      .set('Cookie', adminCookies)
      .expect(200);
    return getResponse.body as EmailMessageSummary;
  }

  /**
   * Reads SSE chunks off `path` until `predicate(buffer)` is true, or rejects
   * once `timeoutMs` elapses (covers both "headers never arrive" — nothing
   * was ever pushed — and "arrived but predicate never matched").
   */
  async function readStreamUntil(
    path: string,
    cookies: string[],
    predicate: (buffer: string) => boolean,
    timeoutMs: number,
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { Cookie: cookies.join('; ') },
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`Unexpected SSE response status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const result = await reader.read();
        if (result.done) {
          throw new Error(`Stream ended before match. Buffer: ${buffer}`);
        }
        buffer += decoder.decode(result.value, { stream: true });
        if (predicate(buffer)) {
          return buffer;
        }
      }
    } finally {
      clearTimeout(timeoutHandle);
      controller.abort();
    }
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    await app.listen(0);
    baseUrl = await app.getUrl();

    usersRepository = app.get(UsersRepository);
    processor = app.get(TrackingEventProcessorService);
    realtimeEventsService = app.get(RealtimeEventsService);
    await realtimeEventsService.start();

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

  it('rejects unauthenticated requests to the SSE stream', async () => {
    await request(app.getHttpServer()).get('/realtime/stream').expect(401);
  });

  it('streams a live event within seconds of a real open being recorded', async () => {
    const message = await composeTrackedMessage();

    const streamPromise = readStreamUntil(
      '/realtime/stream',
      adminCookies,
      (buffer) => buffer.includes(`"messageId":"${message.id}"`),
      5_000,
    );

    // Give the fetch above a moment to establish the connection before the
    // event fires.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await processor.processJob({
      data: {
        kind: 'open',
        token: message.publicToken,
        ip: '203.0.113.9',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari',
        occurredAt: new Date().toISOString(),
      },
    } as never);

    const buffer = await streamPromise;
    const dataLine = buffer
      .split('\n')
      .find((line) => line.startsWith('data:') && line.includes(message.id));
    expect(dataLine).toBeDefined();
    const event = JSON.parse(
      dataLine!.slice('data:'.length).trim(),
    ) as RealtimeTrackingEvent;

    expect(event.eventType).toBe('open');
    expect(event.messageId).toBe(message.id);
    expect(event.toEmail).toBe(message.toEmail);
    expect(event.isFirstOpen).toBe(true);
    expect(event.openCount).toBe(1);
  }, 10_000);

  it('does not stream bot-flagged opens', async () => {
    const message = await composeTrackedMessage();

    const streamPromise = readStreamUntil(
      '/realtime/stream',
      adminCookies,
      (buffer) => buffer.includes(`"messageId":"${message.id}"`),
      1_500,
    );

    await new Promise((resolve) => setTimeout(resolve, 200));
    await processor.processJob({
      data: {
        kind: 'open',
        token: message.publicToken,
        ip: '203.0.113.9',
        userAgent: 'ScannerBot/1.0',
        occurredAt: new Date().toISOString(),
      },
    } as never);

    await expect(streamPromise).rejects.toThrow();
  }, 5_000);
});
