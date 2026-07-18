import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  InvitationSummary,
  InviteUserResponse,
  UserSummary,
} from '@tft/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  inviteUserSchema,
  updateUserSchema,
  type InviteUserDto,
  type UpdateUserDto,
} from './dto/users.schemas';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(): Promise<UserSummary[]> {
    return this.usersService.list();
  }

  @Get('invitations')
  listInvitations(): Promise<InvitationSummary[]> {
    return this.usersService.listInvitations();
  }

  @Post('invitations')
  invite(
    @Body(new ZodValidationPipe(inviteUserSchema)) body: InviteUserDto,
    @CurrentUser() currentUser: AccessTokenPayload,
  ): Promise<InviteUserResponse> {
    return this.usersService.invite(body, currentUser.sub);
  }

  @Delete('invitations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvitation(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.usersService.revokeInvitation(id);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<UserSummary> {
    return this.usersService.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserDto,
    @CurrentUser() currentUser: AccessTokenPayload,
  ): Promise<UserSummary> {
    return this.usersService.update(id, body, currentUser.sub);
  }
}
