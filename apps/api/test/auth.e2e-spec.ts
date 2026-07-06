import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import type { AuthUser, InviteUserResponse, UserSummary } from '@tft/shared';
import { AppModule } from './../src/app.module';
import { UsersRepository } from './../src/database/users.repository';

describe('Auth & Users (e2e)', () => {
  let app: INestApplication<App>;
  let usersRepository: UsersRepository;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    usersRepository = app.get(UsersRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createAdmin(): Promise<{ email: string; password: string }> {
    const email = `admin-${randomUUID()}@example.com`;
    const password = 'AdminPass123!';
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await usersRepository.create({
      email,
      name: 'Test Admin',
      passwordHash,
      role: 'admin',
    });
    return { email, password };
  }

  async function login(
    email: string,
    password: string,
  ): Promise<{ cookies: string[]; body: AuthUser }> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return {
      cookies: response.get('Set-Cookie') ?? [],
      body: response.body as AuthUser,
    };
  }

  it('rejects unauthenticated requests to protected endpoints', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer()).get('/users').expect(401);
  });

  it('rejects an unknown login', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever123' })
      .expect(401);
  });

  it('logs in an admin, invites a user, and completes the full invite → accept → login flow', async () => {
    const admin = await createAdmin();
    const { cookies: adminCookies } = await login(admin.email, admin.password);

    const meResponse = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', adminCookies)
      .expect(200);
    expect((meResponse.body as AuthUser).email).toBe(admin.email);

    const inviteEmail = `invitee-${randomUUID()}@example.com`;
    const inviteResponse = await request(app.getHttpServer())
      .post('/users/invitations')
      .set('Cookie', adminCookies)
      .send({ email: inviteEmail, name: 'Invitee', role: 'agent' })
      .expect(201);
    const invite = inviteResponse.body as InviteUserResponse;
    expect(invite.invitation.email).toBe(inviteEmail);
    const token = new URL(invite.acceptUrl).searchParams.get('token');
    expect(token).toBeTruthy();

    // Duplicate invite for the same email is rejected while pending.
    await request(app.getHttpServer())
      .post('/users/invitations')
      .set('Cookie', adminCookies)
      .send({ email: inviteEmail, name: 'Invitee', role: 'agent' })
      .expect(409);

    const acceptResponse = await request(app.getHttpServer())
      .post('/auth/accept-invitation')
      .send({ token, password: 'InviteePass123!' })
      .expect(200);
    expect((acceptResponse.body as AuthUser).email).toBe(inviteEmail);

    // Re-using the same invitation token must fail.
    await request(app.getHttpServer())
      .post('/auth/accept-invitation')
      .send({ token, password: 'AnotherPass123!' })
      .expect(404);

    const { cookies: userCookies } = await login(
      inviteEmail,
      'InviteePass123!',
    );

    // Non-admin invitee cannot access admin-only endpoints.
    await request(app.getHttpServer())
      .get('/users')
      .set('Cookie', userCookies)
      .expect(403);

    // Admin can see the new user in the list.
    const listResponse = await request(app.getHttpServer())
      .get('/users')
      .set('Cookie', adminCookies)
      .expect(200);
    const users = listResponse.body as UserSummary[];
    expect(users.some((u) => u.email === inviteEmail)).toBe(true);
  });

  it('rotates refresh tokens and rejects reuse of a rotated token', async () => {
    const admin = await createAdmin();
    const { cookies } = await login(admin.email, admin.password);
    const refreshCookie = cookies.find((c) => c.startsWith('refresh_token='));
    expect(refreshCookie).toBeTruthy();

    const refreshResponse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [refreshCookie!])
      .expect(200);
    const newCookies = refreshResponse.get('Set-Cookie') ?? [];
    const newRefreshCookie = newCookies.find((c) =>
      c.startsWith('refresh_token='),
    );
    expect(newRefreshCookie).toBeTruthy();
    expect(newRefreshCookie).not.toEqual(refreshCookie);

    // The rotated-out refresh token must no longer work.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [refreshCookie!])
      .expect(401);
  });

  it('logs out and revokes the session', async () => {
    const admin = await createAdmin();
    const { cookies } = await login(admin.email, admin.password);
    const refreshCookie = cookies.find((c) => c.startsWith('refresh_token='));

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', [refreshCookie!])
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [refreshCookie!])
      .expect(401);
  });
});
