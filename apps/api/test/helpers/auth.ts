import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { UserRole } from '@tft/shared';
import { UsersRepository } from '../../src/database/users.repository';

/** Fixed across calls so tests can assert against a known password where needed. */
export const TEST_USER_PASSWORD = 'TestPass123!';

/**
 * Creates a brand-new user of the given role and logs them in, returning
 * the `Set-Cookie` header values to attach to subsequent supertest
 * requests via `.set('Cookie', cookies)`.
 */
export async function loginAsRole(
  app: { getHttpServer(): App },
  usersRepository: UsersRepository,
  role: UserRole,
): Promise<{ userId: string; cookies: string[] }> {
  const email = `${role}-${randomUUID()}@example.com`;
  const passwordHash = await argon2.hash(TEST_USER_PASSWORD, {
    type: argon2.argon2id,
  });
  const user = await usersRepository.create({
    email,
    name: `Test ${role}`,
    passwordHash,
    role,
  });
  const loginResponse = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: TEST_USER_PASSWORD })
    .expect(200);
  return { userId: user.id, cookies: loginResponse.get('Set-Cookie') ?? [] };
}
