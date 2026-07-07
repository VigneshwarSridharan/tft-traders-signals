import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { ScheduledSendListResponse } from '@tft/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  rescheduleSendSchema,
  type RescheduleSendDto,
} from './dto/scheduled-sends.schemas';
import { ScheduledSendsService } from './scheduled-sends.service';

@Controller('scheduled-sends')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScheduledSendsController {
  constructor(private readonly scheduledSendsService: ScheduledSendsService) {}

  @Get()
  list(): Promise<ScheduledSendListResponse> {
    return this.scheduledSendsService.list();
  }

  @Post(':messageId/cancel')
  @HttpCode(200)
  cancel(@Param('messageId', ParseUUIDPipe) messageId: string): Promise<void> {
    return this.scheduledSendsService.cancel(messageId);
  }

  @Post(':messageId/reschedule')
  @HttpCode(200)
  reschedule(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body(new ZodValidationPipe(rescheduleSendSchema))
    body: RescheduleSendDto,
  ): Promise<void> {
    return this.scheduledSendsService.reschedule(messageId, body);
  }
}
