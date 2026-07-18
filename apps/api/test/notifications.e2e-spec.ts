import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  AuthUser,
  ComposeSendResponse,
  CustomerSummary,
  NotificationSummary,
  SenderAccountSummary,
} from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';
import { EmailMessagesRepository } from './../src/database/email-messages.repository';
import { SenderAccountsRepository } from './../src/database/sender-accounts.repository';
import { InboundSyncService } from './../src/inbound/inbound-sync.service';
import type { EmailMessageRow } from './../src/database/rows';

function buildHardBounceDsnSource(params: {
  originalMessageId: string;
  toEmail: string;
}): Buffer {
  return Buffer.from(
    `From: Mail Delivery Subsystem <MAILER-DAEMON@mx.example.com>
To: sales@company.com
Subject: Undelivered Mail Returned to Sender
Message-ID: <bounce-${randomUUID()}@mx.example.com>
Content-Type: multipart/report; report-type=delivery-status;
\tboundary="BOUNDARY1"
MIME-Version: 1.0

--BOUNDARY1
Content-Type: text/plain; charset=us-ascii

This is the mail system.

--BOUNDARY1
Content-Type: message/delivery-status

Final-Recipient: rfc822; ${params.toEmail}
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 no such user

--BOUNDARY1
Content-Type: message/rfc822

From: "Sales" <sales@company.com>
To: ${params.toEmail}
Subject: Your quotation
Message-ID: ${params.originalMessageId}
Date: Mon, 6 Jul 2026 09:59:00 +0000
Content-Type: text/html

<html><body>Hi</body></html>

--BOUNDARY1--
`,
  );
}

describe('Notifications (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let emailMessagesRepository: EmailMessagesRepository;
  let senderAccountsRepository: SenderAccountsRepository;
  let inboundSyncService: InboundSyncService;
  let adminCookies: string[];
  let senderAccount: SenderAccountSummary;
  let nextUid = 1;

  async function loginAsNewUser(
    role: 'admin' | 'agent',
  ): Promise<{ cookies: string[]; user: AuthUser }> {
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
    return {
      cookies: loginResponse.get('Set-Cookie') ?? [],
      user: loginResponse.body as AuthUser,
    };
  }

  async function composeTrackedMessage(
    cookies: string[],
  ): Promise<EmailMessageRow> {
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
      .set('Cookie', cookies)
      .field(
        'payload',
        JSON.stringify({
          senderAccountId: senderAccount.id,
          customerIds: [customer.id],
          subject: 'Your quotation',
          bodyHtml: '<p>Hi, here is your quote.</p>',
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

  async function deliverHardBounce(message: EmailMessageRow): Promise<void> {
    const account = await senderAccountsRepository.findById(senderAccount.id);
    if (!account) {
      throw new Error('Sender account not found');
    }
    await inboundSyncService.processMessage(account, {
      uid: nextUid++,
      source: buildHardBounceDsnSource({
        originalMessageId: message.message_id_header!,
        toEmail: message.to_email,
      }),
      envelope: {
        date: new Date(),
        subject: 'Undelivered Mail Returned to Sender',
        messageId: `<bounce-${randomUUID()}@mx.example.com>`,
        from: [{ address: 'mailer-daemon@mx.example.com' }],
        to: [{ address: account.email }],
      },
    } as never);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    usersRepository = app.get(UsersRepository);
    emailMessagesRepository = app.get(EmailMessagesRepository);
    senderAccountsRepository = app.get(SenderAccountsRepository);
    inboundSyncService = app.get(InboundSyncService);

    const admin = await loginAsNewUser('admin');
    adminCookies = admin.cookies;

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

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/notifications').expect(401);
  });

  it('notifies the sender on a hard bounce, and stops once they disable that preference', async () => {
    const agent = await loginAsNewUser('agent');

    const message = await composeTrackedMessage(agent.cookies);
    await deliverHardBounce(message);

    const listResponse = await request(app.getHttpServer())
      .get('/notifications')
      .set('Cookie', agent.cookies)
      .expect(200);
    const notifications = listResponse.body as NotificationSummary[];
    expect(
      notifications.some(
        (n) => n.type === 'bounce' && n.messageId === message.id,
      ),
    ).toBe(true);

    const unreadResponse = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Cookie', agent.cookies)
      .expect(200);
    expect((unreadResponse.body as { count: number }).count).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .patch('/notifications/preferences')
      .set('Cookie', agent.cookies)
      .send({ bounce: { inApp: false } })
      .expect(200);

    const secondMessage = await composeTrackedMessage(agent.cookies);
    await deliverHardBounce(secondMessage);

    const listAfterDisable = await request(app.getHttpServer())
      .get('/notifications')
      .set('Cookie', agent.cookies)
      .expect(200);
    const notificationsAfterDisable =
      listAfterDisable.body as NotificationSummary[];
    expect(
      notificationsAfterDisable.some((n) => n.messageId === secondMessage.id),
    ).toBe(false);
  }, 15_000);

  it('marks a notification as read', async () => {
    const agent = await loginAsNewUser('agent');
    const message = await composeTrackedMessage(agent.cookies);
    await deliverHardBounce(message);

    const listResponse = await request(app.getHttpServer())
      .get('/notifications')
      .set('Cookie', agent.cookies)
      .expect(200);
    const [notification] = listResponse.body as NotificationSummary[];
    expect(notification.readAt).toBeNull();

    const markReadResponse = await request(app.getHttpServer())
      .post(`/notifications/${notification.id}/read`)
      .set('Cookie', agent.cookies)
      .expect(201);
    expect(
      (markReadResponse.body as NotificationSummary).readAt,
    ).not.toBeNull();
  });

  it("does not leak one user's notifications to another", async () => {
    const agentA = await loginAsNewUser('agent');
    const agentB = await loginAsNewUser('agent');
    const message = await composeTrackedMessage(agentA.cookies);
    await deliverHardBounce(message);

    const listForB = await request(app.getHttpServer())
      .get('/notifications')
      .set('Cookie', agentB.cookies)
      .expect(200);
    expect(
      (listForB.body as NotificationSummary[]).some(
        (n) => n.messageId === message.id,
      ),
    ).toBe(false);
  });
});
