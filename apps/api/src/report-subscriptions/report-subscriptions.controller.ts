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
import type { ReportSubscriptionSummary } from '@tft/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ReportSubscriptionsService } from './report-subscriptions.service';
import { ReportSubscriptionsQueueService } from './report-subscriptions-queue.service';
import {
  createReportSubscriptionSchema,
  updateReportSubscriptionSchema,
  type CreateReportSubscriptionDto,
  type UpdateReportSubscriptionDto,
} from './dto/report-subscriptions.schemas';

@Controller('report-subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'manager')
export class ReportSubscriptionsController {
  constructor(
    private readonly reportSubscriptionsService: ReportSubscriptionsService,
    private readonly reportSubscriptionsQueueService: ReportSubscriptionsQueueService,
  ) {}

  @Get()
  list(): Promise<ReportSubscriptionSummary[]> {
    return this.reportSubscriptionsService.list();
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReportSubscriptionSummary> {
    return this.reportSubscriptionsService.get(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createReportSubscriptionSchema))
    body: CreateReportSubscriptionDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ReportSubscriptionSummary> {
    return this.reportSubscriptionsService.create(body, user.sub);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateReportSubscriptionSchema))
    body: UpdateReportSubscriptionDto,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<ReportSubscriptionSummary> {
    return this.reportSubscriptionsService.update(id, body, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    return this.reportSubscriptionsService.delete(id, user.sub);
  }

  @Post(':id/run-now')
  @HttpCode(HttpStatus.ACCEPTED)
  async runNow(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.reportSubscriptionsService.get(id);
    await this.reportSubscriptionsQueueService.enqueueRunNow(id);
  }
}
