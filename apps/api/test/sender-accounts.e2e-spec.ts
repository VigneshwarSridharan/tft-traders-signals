import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  AuthUser,
  SenderAccountSummary,
  VerifySenderAccountResponse,
} from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';
import {
  MailConnectionTester,
  type ConnectionCredentials,
} from './../src/sender-accounts/mail-connection-tester.service';

describe('Sender accounts (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;
  let mailConnectionTester: { verify: jest.Mock };
  let adminCookies: string[];

  beforeAll(async () => {
    mailConnectionTester = { verify: jest.fn() };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailConnectionTester)
      .useValue(mailConnectionTester)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    usersRepository = app.get(UsersRepository);

    const email = `admin-${randomUUID()}@example.com`;
    const password = 'AdminPass123!';
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    await usersRepository.create({
      email,
      name: 'Test Admin',
      passwordHash,
      role: 'admin',
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    adminCookies = loginResponse.get('Set-Cookie') ?? [];
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/sender-accounts').expect(401);
  });

  it('creates, lists, verifies, and deletes a sender account without ever exposing the credential', async () => {
    const email = `sales-${randomUUID()}@example.com`;

    const createResponse = await request(app.getHttpServer())
      .post('/sender-accounts')
      .set('Cookie', adminCookies)
      .send({
        email,
        appPassword: 'zoho-app-password',
        displayName: 'Sales Team',
        dailyQuota: 200,
        hourlyQuota: 30,
      })
      .expect(201);

    const created = createResponse.body as SenderAccountSummary;
    expect(created.email).toBe(email);
    expect(created.smtpHost).toBe('smtp.zoho.com');
    expect(created.status).toBe('active');
    expect(created.dailyUsed).toBe(0);
    expect(JSON.stringify(created)).not.toContain('zoho-app-password');

    // Duplicate email is rejected.
    await request(app.getHttpServer())
      .post('/sender-accounts')
      .set('Cookie', adminCookies)
      .send({ email, appPassword: 'another-password' })
      .expect(409);

    const listResponse = await request(app.getHttpServer())
      .get('/sender-accounts')
      .set('Cookie', adminCookies)
      .expect(200);
    const accounts = listResponse.body as SenderAccountSummary[];
    expect(accounts.some((account) => account.id === created.id)).toBe(true);

    mailConnectionTester.verify.mockResolvedValueOnce({
      smtp: { ok: false, message: 'Invalid credentials' },
      imap: { ok: true, message: 'IMAP login succeeded' },
    });
    const failedVerify = await request(app.getHttpServer())
      .post(`/sender-accounts/${created.id}/verify`)
      .set('Cookie', adminCookies)
      .expect(201);
    const failedBody = failedVerify.body as VerifySenderAccountResponse;
    expect(failedBody.status).toBe('auth_failed');
    expect(failedBody.message).toContain('Invalid credentials');

    mailConnectionTester.verify.mockResolvedValueOnce({
      smtp: { ok: true, message: 'SMTP login succeeded' },
      imap: { ok: true, message: 'IMAP login succeeded' },
    });
    const okVerify = await request(app.getHttpServer())
      .post(`/sender-accounts/${created.id}/verify`)
      .set('Cookie', adminCookies)
      .expect(201);
    const okBody = okVerify.body as VerifySenderAccountResponse;
    expect(okBody.status).toBe('active');
    expect(okBody.lastVerifiedAt).toBeTruthy();

    const verifyCalls = mailConnectionTester.verify.mock.calls as [
      ConnectionCredentials,
    ][];
    const verifiedCall = verifyCalls[verifyCalls.length - 1][0];
    expect(verifiedCall.password).toBe('zoho-app-password');

    await request(app.getHttpServer())
      .patch(`/sender-accounts/${created.id}`)
      .set('Cookie', adminCookies)
      .send({ dailyQuota: 500 })
      .expect(200)
      .expect((res) => {
        expect((res.body as SenderAccountSummary).dailyQuota).toBe(500);
      });

    await request(app.getHttpServer())
      .delete(`/sender-accounts/${created.id}`)
      .set('Cookie', adminCookies)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/sender-accounts/${created.id}`)
      .set('Cookie', adminCookies)
      .expect(404);
  });

  it('rejects non-admin access', async () => {
    const email = `agent-${randomUUID()}@example.com`;
    const passwordHash = await argon2.hash('AgentPass123!', {
      type: argon2.argon2id,
    });
    await usersRepository.create({
      email,
      name: 'Agent',
      passwordHash,
      role: 'agent',
    });
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'AgentPass123!' })
      .expect(200);
    const agentCookies = loginResponse.get('Set-Cookie') ?? [];
    void (loginResponse.body as AuthUser);

    await request(app.getHttpServer())
      .get('/sender-accounts')
      .set('Cookie', agentCookies)
      .expect(403);
  });
});
