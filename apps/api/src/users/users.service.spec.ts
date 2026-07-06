import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { InvitationsRepository } from '../database/invitations.repository';
import { UsersRepository } from '../database/users.repository';
import type { InvitationRow, UserRow } from '../database/rows';

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
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: jest.Mocked<UsersRepository>;
  let invitationsRepository: jest.Mocked<InvitationsRepository>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    usersRepository = {
      list: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      update: jest.fn(),
      countActiveAdmins: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;

    invitationsRepository = {
      findPendingByEmail: jest.fn(),
      create: jest.fn(),
      listPending: jest.fn(),
      findById: jest.fn(),
      revoke: jest.fn(),
    } as unknown as jest.Mocked<InvitationsRepository>;

    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          INVITATION_TTL_HOURS: 72,
          WEB_APP_URL: 'http://localhost:3001',
        };
        return values[key];
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new UsersService(
      usersRepository,
      invitationsRepository,
      configService,
    );
  });

  describe('update', () => {
    it('blocks demoting the last active admin', async () => {
      usersRepository.findById.mockResolvedValue(buildUser());
      usersRepository.countActiveAdmins.mockResolvedValue(0);

      await expect(service.update('user-1', { role: 'agent' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it('blocks deactivating the last active admin', async () => {
      usersRepository.findById.mockResolvedValue(buildUser());
      usersRepository.countActiveAdmins.mockResolvedValue(0);

      await expect(
        service.update('user-1', { isActive: false }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows demoting an admin when another active admin remains', async () => {
      const existing = buildUser();
      const updated = buildUser({ role: 'agent' });
      usersRepository.findById.mockResolvedValue(existing);
      usersRepository.countActiveAdmins.mockResolvedValue(1);
      usersRepository.update.mockResolvedValue(updated);

      const result = await service.update('user-1', { role: 'agent' });
      expect(result.role).toBe('agent');
    });

    it('allows unrelated updates without checking admin counts', async () => {
      const existing = buildUser({ role: 'viewer' });
      usersRepository.findById.mockResolvedValue(existing);
      usersRepository.update.mockResolvedValue({
        ...existing,
        name: 'New Name',
      });

      await service.update('user-1', { name: 'New Name' });
      expect(usersRepository.countActiveAdmins).not.toHaveBeenCalled();
    });

    it('throws when the user does not exist', async () => {
      usersRepository.findById.mockResolvedValue(null);
      await expect(service.update('missing', { name: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('invite', () => {
    it('rejects when a user with that email already exists', async () => {
      usersRepository.findByEmail.mockResolvedValue(buildUser());
      await expect(
        service.invite(
          { email: 'admin@example.com', name: 'Admin', role: 'agent' },
          'inviter-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects when an invitation is already pending', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      invitationsRepository.findPendingByEmail.mockResolvedValue(
        {} as InvitationRow,
      );
      await expect(
        service.invite(
          { email: 'new@example.com', name: 'New', role: 'agent' },
          'inviter-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('creates an invitation and returns an accept URL', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      invitationsRepository.findPendingByEmail.mockResolvedValue(null);
      const invitationRow: InvitationRow = {
        id: 'invite-1',
        email: 'new@example.com',
        name: 'New',
        role: 'agent',
        token_hash: 'hash',
        invited_by: 'inviter-1',
        expires_at: new Date(),
        accepted_at: null,
        revoked_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      invitationsRepository.create.mockResolvedValue(invitationRow);

      const result = await service.invite(
        { email: 'new@example.com', name: 'New', role: 'agent' },
        'inviter-1',
      );

      expect(result.invitation.id).toBe('invite-1');
      expect(result.acceptUrl).toContain(
        'http://localhost:3001/accept-invitation?token=',
      );
    });
  });
});
