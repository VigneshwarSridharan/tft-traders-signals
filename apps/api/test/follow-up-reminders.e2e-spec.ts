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
  CustomerListResponse,
  CustomerSummary,
  FollowUpDraftResponse,
  NotificationSummary,
  SenderAccountSummary,
} from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';
import { PG_POOL } from './../src/database/database.constants';
import { EmailMessagesRepository } from './../src/database/email-messages.repository';
import { TrackingEventsRepository } from './../src/database/tracking-events.repository';
import { EngagementRollupService } from './../src/engagement/engagement-rollup.service';
import type { EmailMessageRow } from './../src/database/rows';

describe('Follow-up reminders & customer engagement (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let pool: Pool;
  let emailMessagesRepository: EmailMessagesRepository;
  let trackingEventsRepository: TrackingEventsRepository;
  let engagementRollupService: EngagementRollupService;
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

  async function composeMessage(params: {
    cookies: string[];
    customerId: string;
    followUpDays?: number;
    parentMessageId?: string;
    subject?: string;
  }): Promise<EmailMessageRow> {
    const composeResponse = await request(app.getHttpServer())
      .post('/email-messages/compose')
      .set('Cookie', params.cookies)
      .field(
        'payload',
        JSON.stringify({
          senderAccountId: senderAccount.id,
          customerIds: [params.customerId],
          subject: params.subject ?? 'Your quotation',
          bodyHtml: '<p>Hi, here is your quote.</p>',
          followUpDays: params.followUpDays,
          parentMessageId: params.parentMessageId,
        }),
      )
      .expect(201);
    const messageId = (composeResponse.body as ComposeSendResponse).results[0]
      .messageId as string;
    const row = await emailMessagesRepository.findById(messageId);
    if (!row) {
      throw new Error('Composed message not found');
    }
    return row;
  }

  /** Fast-forwards a message straight to "sent N days ago" so the follow-up job's window has elapsed, bypassing the real send worker. */
  async function markSentDaysAgo(
    messageId: string,
    daysAgo: number,
  ): Promise<void> {
    await pool.query(
      `UPDATE email_messages SET status = 'sent', sent_at = now() - ($2 || ' days')::interval WHERE id = $1`,
      [messageId, daysAgo],
    );
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
    emailMessagesRepository = app.get(EmailMessagesRepository);
    trackingEventsRepository = app.get(TrackingEventsRepository);
    engagementRollupService = app.get(EngagementRollupService);

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

  describe('follow-up reminder notification', () => {
    it('fires a follow_up_due notification once the configured day threshold has elapsed with no reply/open', async () => {
      const agent = await loginAsNewUser('agent');
      const customer = await createCustomer();

      const message = await composeMessage({
        cookies: agent,
        customerId: customer.id,
        followUpDays: 3,
      });
      await markSentDaysAgo(message.id, 3);

      await engagementRollupService.run();

      const listResponse = await request(app.getHttpServer())
        .get('/notifications')
        .set('Cookie', agent)
        .expect(200);
      const notifications = listResponse.body as NotificationSummary[];
      expect(
        notifications.some(
          (n) => n.type === 'follow_up_due' && n.messageId === message.id,
        ),
      ).toBe(true);

      const refreshed = await emailMessagesRepository.findById(message.id);
      expect(refreshed?.follow_up_notified_at).not.toBeNull();
    });

    it('does not fire before the threshold elapses, or once a reply/open already landed', async () => {
      const agent = await loginAsNewUser('agent');

      const tooSoon = await composeMessage({
        cookies: agent,
        customerId: (await createCustomer()).id,
        followUpDays: 5,
      });
      await markSentDaysAgo(tooSoon.id, 1);

      const alreadyOpened = await composeMessage({
        cookies: agent,
        customerId: (await createCustomer()).id,
        followUpDays: 2,
      });
      await markSentDaysAgo(alreadyOpened.id, 5);
      await pool.query(
        `UPDATE email_messages SET first_opened_at = now() WHERE id = $1`,
        [alreadyOpened.id],
      );

      await engagementRollupService.run();

      const listResponse = await request(app.getHttpServer())
        .get('/notifications')
        .set('Cookie', agent)
        .expect(200);
      const notifications = listResponse.body as NotificationSummary[];
      expect(notifications.some((n) => n.messageId === tooSoon.id)).toBe(false);
      expect(notifications.some((n) => n.messageId === alreadyOpened.id)).toBe(
        false,
      );
    });

    it('only ever fires once per message', async () => {
      const agent = await loginAsNewUser('agent');
      const customer = await createCustomer();
      const message = await composeMessage({
        cookies: agent,
        customerId: customer.id,
        followUpDays: 1,
      });
      await markSentDaysAgo(message.id, 2);

      await engagementRollupService.run();
      await engagementRollupService.run();

      const listResponse = await request(app.getHttpServer())
        .get('/notifications')
        .set('Cookie', agent)
        .expect(200);
      const matches = (listResponse.body as NotificationSummary[]).filter(
        (n) => n.messageId === message.id,
      );
      expect(matches).toHaveLength(1);
    });
  });

  describe('one-click follow-up compose draft', () => {
    it('prefills the same customer, sender account, and a "Re:" subject', async () => {
      const agent = await loginAsNewUser('agent');
      const customer = await createCustomer();
      const message = await composeMessage({
        cookies: agent,
        customerId: customer.id,
        subject: 'Your quotation #123',
      });

      const draftResponse = await request(app.getHttpServer())
        .get(`/email-messages/${message.id}/follow-up-draft`)
        .set('Cookie', agent)
        .expect(200);
      const draft = draftResponse.body as FollowUpDraftResponse;

      expect(draft.parentMessageId).toBe(message.id);
      expect(draft.customerId).toBe(customer.id);
      expect(draft.senderAccountId).toBe(senderAccount.id);
      expect(draft.subject).toBe('Re: Your quotation #123');
    });

    it('404s for an unknown message', async () => {
      const agent = await loginAsNewUser('agent');
      await request(app.getHttpServer())
        .get(`/email-messages/${randomUUID()}/follow-up-draft`)
        .set('Cookie', agent)
        .expect(404);
    });
  });

  describe('reply threading', () => {
    it('threads a follow-up send against its parent via In-Reply-To/References', async () => {
      const agent = await loginAsNewUser('agent');
      const customer = await createCustomer();
      const parent = await composeMessage({
        cookies: agent,
        customerId: customer.id,
        subject: 'Original quote',
      });

      const followUp = await composeMessage({
        cookies: agent,
        customerId: customer.id,
        subject: 'Following up',
        parentMessageId: parent.id,
      });

      expect(followUp.parent_message_id).toBe(parent.id);
      expect(followUp.in_reply_to_header).toBe(parent.message_id_header);
      expect(followUp.references_header).toBe(parent.message_id_header);
    });

    it('rejects a follow-up send to more than one recipient', async () => {
      const agent = await loginAsNewUser('agent');
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      const parent = await composeMessage({
        cookies: agent,
        customerId: customerA.id,
      });

      await request(app.getHttpServer())
        .post('/email-messages/compose')
        .set('Cookie', agent)
        .field(
          'payload',
          JSON.stringify({
            senderAccountId: senderAccount.id,
            customerIds: [customerA.id, customerB.id],
            subject: 'Following up',
            bodyHtml: '<p>Hi</p>',
            parentMessageId: parent.id,
          }),
        )
        .expect(400);
    });
  });

  describe('customer engagement score', () => {
    it('ranks an obviously-engaged customer above an unengaged one', async () => {
      const agent = await loginAsNewUser('agent');
      const engaged = await createCustomer({ name: 'Engaged Customer' });
      const unengaged = await createCustomer({ name: 'Unengaged Customer' });

      const engagedMessage = await composeMessage({
        cookies: agent,
        customerId: engaged.id,
      });
      await composeMessage({ cookies: agent, customerId: unengaged.id });

      const now = new Date();
      for (const eventType of ['open', 'click', 'reply'] as const) {
        await trackingEventsRepository.insert({
          messageId: engagedMessage.id,
          linkId: null,
          eventType,
          occurredAt: now,
          ip: null,
          userAgent: null,
          deviceType: null,
          os: null,
          browser: null,
          geoCountry: null,
          geoCity: null,
          isBot: false,
          isProxy: false,
          metadata: {},
        });
      }

      await engagementRollupService.run();

      const listResponse = await request(app.getHttpServer())
        .get('/customers?sort=engagementScore&sortDir=desc&pageSize=100')
        .set('Cookie', adminCookies)
        .expect(200);
      const items = (listResponse.body as CustomerListResponse).items;
      const engagedIndex = items.findIndex((c) => c.id === engaged.id);
      const unengagedIndex = items.findIndex((c) => c.id === unengaged.id);

      expect(engagedIndex).toBeGreaterThanOrEqual(0);
      expect(unengagedIndex).toBeGreaterThanOrEqual(0);
      expect(engagedIndex).toBeLessThan(unengagedIndex);
      expect(items[engagedIndex].engagementScore).toBeGreaterThan(0);
      expect(items[unengagedIndex].engagementScore).toBe(0);
    });
  });

  describe('customer timeline', () => {
    it('returns sends and tracking events in reverse-chronological order', async () => {
      const agent = await loginAsNewUser('agent');
      const customer = await createCustomer();
      const message = await composeMessage({
        cookies: agent,
        customerId: customer.id,
        subject: 'Timeline test',
      });
      await markSentDaysAgo(message.id, 1);
      await trackingEventsRepository.insert({
        messageId: message.id,
        linkId: null,
        eventType: 'open',
        occurredAt: new Date(),
        ip: null,
        userAgent: null,
        deviceType: null,
        os: null,
        browser: null,
        geoCountry: null,
        geoCity: null,
        isBot: false,
        isProxy: false,
        metadata: {},
      });

      const timelineResponse = await request(app.getHttpServer())
        .get(`/customers/${customer.id}/timeline`)
        .set('Cookie', agent)
        .expect(200);
      const items = (timelineResponse.body as { items: unknown[] }).items as {
        type: string;
        messageId: string;
      }[];

      expect(items[0].type).toBe('open');
      expect(items[1].type).toBe('sent');
      expect(items.every((item) => item.messageId === message.id)).toBe(true);
    });
  });
});
