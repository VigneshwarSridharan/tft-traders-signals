import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { EnvConfig } from '../config/env.validation';
import { InvitationsRepository } from '../database/invitations.repository';
import { SessionsRepository } from '../database/sessions.repository';
import { UsersRepository } from '../database/users.repository';
import type { UserRow } from '../database/rows';
import { generateToken, hashToken } from './token.util';
import type { AccessTokenPayload } from './jwt-payload.interface';

export interface RequestMeta {
  userAgent?: string | null;
  ip?: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly invitationsRepository: InvitationsRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async validateCredentials(email: string, password: string): Promise<UserRow> {
    const user = await this.usersRepository.findByEmail(email);
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await argon2.verify(user.password_hash, password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }

  async login(user: UserRow, meta: RequestMeta): Promise<TokenPair> {
    const tokens = await this.issueTokens(user, meta);
    await this.usersRepository.touchLastLogin(user.id);
    return tokens;
  }

  async refresh(
    refreshToken: string,
    meta: RequestMeta,
  ): Promise<TokenPair & { user: UserRow }> {
    const session = await this.sessionsRepository.findValidByHash(
      hashToken(refreshToken),
    );
    if (!session) {
      throw new UnauthorizedException('Session expired, please log in again');
    }

    const user = await this.usersRepository.findById(session.user_id);
    if (!user || !user.is_active) {
      await this.sessionsRepository.revokeById(session.id);
      throw new UnauthorizedException('Account no longer active');
    }

    // Rotate: revoke the presented refresh token and issue a fresh pair.
    await this.sessionsRepository.revokeById(session.id);
    const tokens = await this.issueTokens(user, meta);
    return { ...tokens, user };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }
    await this.sessionsRepository.revokeByHash(hashToken(refreshToken));
  }

  async acceptInvitation(
    token: string,
    password: string,
    meta: RequestMeta,
  ): Promise<TokenPair & { user: UserRow }> {
    const invitation = await this.invitationsRepository.findValidByTokenHash(
      hashToken(token),
    );
    if (!invitation) {
      throw new NotFoundException(
        'Invitation not found, expired, or already used',
      );
    }

    const existing = await this.usersRepository.findByEmail(invitation.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    const user = await this.usersRepository.create({
      email: invitation.email,
      name: invitation.name,
      passwordHash,
      role: invitation.role,
    });
    await this.invitationsRepository.markAccepted(invitation.id);

    const tokens = await this.issueTokens(user, meta);
    await this.usersRepository.touchLastLogin(user.id);
    return { ...tokens, user };
  }

  private async issueTokens(
    user: UserRow,
    meta: RequestMeta,
  ): Promise<TokenPair> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.configService.get('JWT_ACCESS_TTL', { infer: true }),
    });

    const refreshToken = generateToken();
    const ttlDays = this.configService.get('REFRESH_TOKEN_TTL_DAYS', {
      infer: true,
    });
    const refreshExpiresAt = new Date(
      Date.now() + ttlDays * 24 * 60 * 60 * 1000,
    );

    await this.sessionsRepository.create({
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });

    return { accessToken, refreshToken, refreshExpiresAt };
  }
}
