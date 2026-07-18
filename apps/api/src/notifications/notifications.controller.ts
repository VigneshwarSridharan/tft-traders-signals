import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { NotificationPreferences, NotificationSummary } from '@tft/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  listNotificationsQuerySchema,
  updateNotificationPreferencesSchema,
  type ListNotificationsQueryDto,
  type UpdateNotificationPreferencesDto,
} from './dto/notifications.schemas';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listNotificationsQuerySchema))
    query: ListNotificationsQueryDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<NotificationSummary[]> {
    return this.notificationsService.listForUser(user.sub, query);
  }

  @Get('unread-count')
  async unreadCount(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<{ count: number }> {
    const count = await this.notificationsService.countUnread(user.sub);
    return { count };
  }

  @Get('preferences')
  getPreferences(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<NotificationPreferences> {
    return this.notificationsService.getPreferences(user.sub);
  }

  @Patch('preferences')
  updatePreferences(
    @Body(new ZodValidationPipe(updateNotificationPreferencesSchema))
    body: UpdateNotificationPreferencesDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<NotificationPreferences> {
    return this.notificationsService.updatePreferences(user.sub, body);
  }

  @Post('read-all')
  async markAllRead(@CurrentUser() user: AccessTokenPayload): Promise<void> {
    await this.notificationsService.markAllRead(user.sub);
  }

  @Post(':id/read')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<NotificationSummary> {
    return this.notificationsService.markRead(id, user.sub);
  }
}
