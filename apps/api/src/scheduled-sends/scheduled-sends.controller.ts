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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  rescheduleSendSchema,
  scheduledSendListQuerySchema,
  type RescheduleSendDto,
  type ScheduledSendListQueryDto,
} from './dto/scheduled-sends.schemas';
import { ScheduledSendsService } from './scheduled-sends.service';

@Controller('scheduled-sends')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScheduledSendsController {
  constructor(private readonly scheduledSendsService: ScheduledSendsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(scheduledSendListQuerySchema))
    query: ScheduledSendListQueryDto,
  ): Promise<ScheduledSendListResponse> {
    return this.scheduledSendsService.list(query);
  }

  @Patch(':messageId')
  reschedule(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body(new ZodValidationPipe(rescheduleSendSchema))
    body: RescheduleSendDto,
  ): Promise<EmailMessageSummary> {
    return this.scheduledSendsService.reschedule(messageId, body);
  }

  @Delete(':messageId')
  cancel(
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ): Promise<EmailMessageSummary> {
    return this.scheduledSendsService.cancel(messageId);
  }
}
