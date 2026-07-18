import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  EmailMessageSummary,
  ScheduledSendListResponse,
} from '@tft/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  rescheduleSendSchema,
  scheduledSendListQuerySchema,
  type RescheduleSendDto,
  type ScheduledSendListQueryDto,
} from './dto/scheduled-sends.schemas';
import { ScheduledSendsService } from './scheduled-sends.service';

/** Scheduling is a sending action — same roles as compose (viewers are read-only). */
@Controller('scheduled-sends')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'manager', 'agent')
export class ScheduledSendsController {
  constructor(private readonly scheduledSendsService: ScheduledSendsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(scheduledSendListQuerySchema))
    query: ScheduledSendListQueryDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ScheduledSendListResponse> {
    return this.scheduledSendsService.list(query, user);
  }

  @Patch(':messageId')
  reschedule(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body(new ZodValidationPipe(rescheduleSendSchema))
    body: RescheduleSendDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<EmailMessageSummary> {
    return this.scheduledSendsService.reschedule(messageId, body, user);
  }

  @Delete(':messageId')
  cancel(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<EmailMessageSummary> {
    return this.scheduledSendsService.cancel(messageId, user);
  }
}
