import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  analyticsExportQuerySchema,
  analyticsPdfQuerySchema,
  sentMailExportQuerySchema,
  type AnalyticsExportQueryDto,
  type AnalyticsPdfQueryDto,
  type SentMailExportQueryDto,
} from './dto/reports.schemas';
import { ReportsService, type ExportFile } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // No @Roles(): mirrors GET /sent-mail — open to any authenticated role,
  // ownership-scoped to "own sends" for agents in the service layer.
  @Get('sent-mail/export')
  async exportSentMail(
    @Query(new ZodValidationPipe(sentMailExportQuerySchema))
    query: SentMailExportQueryDto,
    @CurrentUser() user: AccessTokenPayload,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.reportsService.exportSentMail(query, user);
    this.send(res, file);
  }

  @Get('analytics/export')
  @Roles('admin', 'manager', 'viewer')
  async exportAnalytics(
    @Query(new ZodValidationPipe(analyticsExportQuerySchema))
    query: AnalyticsExportQueryDto,
    @CurrentUser() user: AccessTokenPayload,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.reportsService.exportAnalytics(query, user);
    this.send(res, file);
  }

  @Get('analytics/pdf')
  @Roles('admin', 'manager', 'viewer')
  async analyticsPdf(
    @Query(new ZodValidationPipe(analyticsPdfQuerySchema))
    query: AnalyticsPdfQueryDto,
    @CurrentUser() user: AccessTokenPayload,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.reportsService.generateAnalyticsPdf(query, user);
    this.send(res, file);
  }

  private send(res: Response, file: ExportFile): void {
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.send(file.buffer);
  }
}
