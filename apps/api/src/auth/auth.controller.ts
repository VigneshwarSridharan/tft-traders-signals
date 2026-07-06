import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { AuthUser } from '@tft/shared';
import type { EnvConfig } from '../config/env.validation';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UsersRepository } from '../database/users.repository';
import { AuthService } from './auth.service';
import { toAuthUser } from './auth.mapper';
import {
  acceptInvitationSchema,
  loginSchema,
  type AcceptInvitationDto,
  type LoginDto,
} from './dto/auth.schemas';
import {
  REFRESH_TOKEN_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from './cookie.util';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AccessTokenPayload } from './jwt-payload.interface';

function requestMeta(req: Request): {
  userAgent: string | null;
  ip: string | null;
} {
  return { userAgent: req.get('user-agent') ?? null, ip: req.ip ?? null };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersRepository: UsersRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const user = await this.authService.validateCredentials(
      body.email,
      body.password,
    );
    const tokens = await this.authService.login(user, requestMeta(req));
    setAuthCookies(res, this.configService, tokens);
    return toAuthUser(user);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as
      string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException('No session to refresh');
    }

    const { user, ...tokens } = await this.authService.refresh(
      refreshToken,
      requestMeta(req),
    );
    setAuthCookies(res, this.configService, tokens);
    return toAuthUser(user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as
      string | undefined;
    await this.authService.logout(refreshToken);
    clearAuthCookies(res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() currentUser: AccessTokenPayload): Promise<AuthUser> {
    const user = await this.usersRepository.findById(currentUser.sub);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return toAuthUser(user);
  }

  @Post('accept-invitation')
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(
    @Body(new ZodValidationPipe(acceptInvitationSchema))
    body: AcceptInvitationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const { user, ...tokens } = await this.authService.acceptInvitation(
      body.token,
      body.password,
      requestMeta(req),
    );
    setAuthCookies(res, this.configService, tokens);
    return toAuthUser(user);
  }
}
