import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { InvitationSummary, UserSummary } from '@tft/shared';
import type { EnvConfig } from '../config/env.validation';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { InvitationsRepository } from '../database/invitations.repository';
import { UsersRepository } from '../database/users.repository';
import { generateToken, hashToken } from '../auth/token.util';
import { toInvitationSummary, toUserSummary } from './users.mapper';
import type { InviteUserDto, UpdateUserDto } from './dto/users.schemas';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly invitationsRepository: InvitationsRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly auditLogsRepository: AuditLogsRepository,
  ) {}

  async list(): Promise<UserSummary[]> {
    const rows = await this.usersRepository.list();
    return rows.map(toUserSummary);
  }

  async get(id: string): Promise<UserSummary> {
    const row = await this.usersRepository.findById(id);
    if (!row) {
      throw new NotFoundException('User not found');
    }
    return toUserSummary(row);
  }

  async update(
    id: string,
    patch: UpdateUserDto,
    actorUserId: string | null = null,
  ): Promise<UserSummary> {
    const existing = await this.usersRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const isAdmin = existing.role === 'admin';
    const losingAdminRole =
      isAdmin && patch.role !== undefined && patch.role !== 'admin';
    const losingActiveStatus =
      isAdmin && existing.is_active && patch.isActive === false;
    if (losingAdminRole || losingActiveStatus) {
      const remainingAdmins = await this.usersRepository.countActiveAdmins(id);
      if (remainingAdmins === 0) {
        throw new ForbiddenException(
          'Cannot remove the last active admin account',
        );
      }
    }

    const updated = await this.usersRepository.update(id, patch);
    if (!updated) {
      throw new NotFoundException('User not found');
    }

    if (patch.role !== undefined && patch.role !== existing.role) {
      await this.auditLogsRepository.record({
        userId: actorUserId,
        action: 'user.role_change',
        entityType: 'user',
        entityId: id,
        metadata: { from: existing.role, to: patch.role },
      });
    }

    return toUserSummary(updated);
  }

  async invite(
    input: InviteUserDto,
    invitedBy: string,
  ): Promise<{ invitation: InvitationSummary; acceptUrl: string }> {
    const existingUser = await this.usersRepository.findByEmail(input.email);
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const existingInvitation =
      await this.invitationsRepository.findPendingByEmail(input.email);
    if (existingInvitation) {
      throw new ConflictException(
        'An invitation is already pending for this email',
      );
    }

    const token = generateToken();
    const ttlHours = this.configService.get('INVITATION_TTL_HOURS', {
      infer: true,
    });
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const invitation = await this.invitationsRepository.create({
      email: input.email,
      name: input.name,
      role: input.role,
      tokenHash: hashToken(token),
      invitedBy,
      expiresAt,
    });

    const webAppUrl = this.configService.get('WEB_APP_URL', { infer: true });
    const acceptUrl = `${webAppUrl}/accept-invitation?token=${token}`;

    return { invitation: toInvitationSummary(invitation), acceptUrl };
  }

  async listInvitations(): Promise<InvitationSummary[]> {
    const rows = await this.invitationsRepository.listPending();
    return rows.map(toInvitationSummary);
  }

  async revokeInvitation(id: string): Promise<void> {
    const invitation = await this.invitationsRepository.findById(id);
    if (!invitation || invitation.accepted_at) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.revoked_at) {
      throw new BadRequestException('Invitation already revoked');
    }
    await this.invitationsRepository.revoke(id);
  }
}
