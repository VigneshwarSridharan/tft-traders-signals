import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { InvitationsRepository } from '../database/invitations.repository';
import { SessionsRepository } from '../database/sessions.repository';
import { UsersRepository } from '../database/users.repository';
import type { InvitationRow, SessionRow, UserRow } from '../database/rows';

function buildUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-1',
    email: 'admin@example.com',
    name: 'Admin',
    password_hash: 'hash',
    role: 'admin',
    is_active: true,
    last_login_at: null,
    theme: 'system',
    notification_prefs: {},
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let usersRepository: jest.Mocked<UsersRepository>;
  let sessionsRepository: jest.Mocked<SessionsRepository>;
  let invitationsRepository: jest.Mocked<InvitationsRepository>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let auditLogsRepository: jest.Mocked<AuditLogsRepository>;

  beforeEach(() => {
    usersRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      touchLastLogin: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;

    sessionsRepository = {
      create: jest.fn(),
      findValidByHash: jest.fn(),
      revokeById: jest.fn(),
      revokeByHash: jest.fn(),
    } as unknown as jest.Mocked<SessionsRepository>;

    invitationsRepository = {
      findValidByTokenHash: jest.fn(),
      markAccepted: jest.fn(),
    } as unknown as jest.Mocked<InvitationsRepository>;

    jwtService = {
      sign: jest.fn().mockReturnValue('signed-jwt'),
    } as unknown as jest.Mocked<JwtService>;

    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          JWT_ACCESS_SECRET: 'secret',
          JWT_ACCESS_TTL: '15m',
          REFRESH_TOKEN_TTL_DAYS: 30,
          INVITATION_TTL_HOURS: 72,
        };
        return values[key];
      }),
    } as unknown as jest.Mocked<ConfigService>;

    auditLogsRepository = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogsRepository>;

    service = new AuthService(
      usersRepository,
      sessionsRepository,
      invitationsRepository,
      jwtService,
      configService,
      auditLogsRepository,
    );
  });

  describe('validateCredentials', () => {
    it('rejects unknown email', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      await expect(
        service.validateCredentials('nope@example.com', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an inactive user', async () => {
      usersRepository.findByEmail.mockResolvedValue(
        buildUser({ is_active: false }),
      );
      await expect(
        service.validateCredentials('admin@example.com', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a wrong password', async () => {
      const passwordHash = await argon2.hash('correct-password', {
        type: argon2.argon2id,
      });
      usersRepository.findByEmail.mockResolvedValue(
        buildUser({ password_hash: passwordHash }),
      );
      await expect(
        service.validateCredentials('admin@example.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns the user on a correct password', async () => {
      const passwordHash = await argon2.hash('correct-password', {
        type: argon2.argon2id,
      });
      const user = buildUser({ password_hash: passwordHash });
      usersRepository.findByEmail.mockResolvedValue(user);
      await expect(
        service.validateCredentials('admin@example.com', 'correct-password'),
      ).resolves.toEqual(user);
    });
  });

  describe('login', () => {
    it('issues tokens and records last login', async () => {
      const user = buildUser();
      sessionsRepository.create.mockResolvedValue({} as SessionRow);

      const tokens = await service.login(user, { userAgent: null, ip: null });

      expect(tokens.accessToken).toBe('signed-jwt');
      expect(typeof tokens.refreshToken).toBe('string');
      expect(sessionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: user.id }),
      );
      expect(usersRepository.touchLastLogin).toHaveBeenCalledWith(user.id);
    });
  });

  describe('refresh', () => {
    it('rejects an unknown refresh token', async () => {
      sessionsRepository.findValidByHash.mockResolvedValue(null);
      await expect(
        service.refresh('bad-token', { userAgent: null, ip: null }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rotates the session and issues a fresh pair', async () => {
      const user = buildUser();
      const session: SessionRow = {
        id: 'session-1',
        user_id: user.id,
        refresh_token_hash: 'hash',
        user_agent: null,
        ip: null,
        expires_at: new Date(Date.now() + 1000),
        revoked_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      sessionsRepository.findValidByHash.mockResolvedValue(session);
      usersRepository.findById.mockResolvedValue(user);
      sessionsRepository.create.mockResolvedValue({} as SessionRow);

      const result = await service.refresh('some-token', {
        userAgent: null,
        ip: null,
      });

      expect(sessionsRepository.revokeById).toHaveBeenCalledWith(session.id);
      expect(result.user).toEqual(user);
      expect(result.accessToken).toBe('signed-jwt');
    });
  });

  describe('logout', () => {
    it('is a no-op when no refresh token is presented', async () => {
      await service.logout(undefined);
      expect(sessionsRepository.revokeByHash).not.toHaveBeenCalled();
    });

    it('revokes the session for a presented refresh token', async () => {
      await service.logout('some-token');
      expect(sessionsRepository.revokeByHash).toHaveBeenCalled();
    });

    it('records an audit row when the session is still valid', async () => {
      sessionsRepository.findValidByHash.mockResolvedValue({
        id: 'session-1',
        user_id: 'user-1',
        refresh_token_hash: 'hash',
        user_agent: null,
        ip: null,
        expires_at: new Date(Date.now() + 1000),
        revoked_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await service.logout('some-token');

      expect(auditLogsRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'auth.logout',
        }),
      );
    });
  });

  describe('acceptInvitation', () => {
    const invitation: InvitationRow = {
      id: 'invite-1',
      email: 'newbie@example.com',
      name: 'New Bie',
      role: 'agent',
      token_hash: 'hash',
      invited_by: 'admin-1',
      expires_at: new Date(Date.now() + 1000),
      accepted_at: null,
      revoked_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('rejects an unknown or expired invitation token', async () => {
      invitationsRepository.findValidByTokenHash.mockResolvedValue(null);
      await expect(
        service.acceptInvitation('token', 'password', {
          userAgent: null,
          ip: null,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when an account already exists for the email', async () => {
      invitationsRepository.findValidByTokenHash.mockResolvedValue(invitation);
      usersRepository.findByEmail.mockResolvedValue(buildUser());
      await expect(
        service.acceptInvitation('token', 'password', {
          userAgent: null,
          ip: null,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates the user, marks the invitation accepted, and logs in', async () => {
      invitationsRepository.findValidByTokenHash.mockResolvedValue(invitation);
      usersRepository.findByEmail.mockResolvedValue(null);
      const createdUser = buildUser({
        id: 'user-2',
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
      });
      usersRepository.create.mockResolvedValue(createdUser);
      sessionsRepository.create.mockResolvedValue({} as SessionRow);

      const result = await service.acceptInvitation('token', 'password123', {
        userAgent: null,
        ip: null,
      });

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: invitation.email,
          role: invitation.role,
        }),
      );
      expect(invitationsRepository.markAccepted).toHaveBeenCalledWith(
        invitation.id,
      );
      expect(result.user).toEqual(createdUser);
    });
  });
});
