import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type {
  AccountLeaderboardResponse,
  AnalyticsKpisResponse,
  AnalyticsTimeseriesResponse,
  SendTimeHeatmapResponse,
  TemplateLeaderboardResponse,
  TopCustomersResponse,
  TopEmailsResponse,
  TopLinksResponse,
} from '@tft/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AnalyticsService } from './analytics.service';
import {
  analyticsHeatmapQuerySchema,
  analyticsKpisQuerySchema,
  analyticsLeaderboardQuerySchema,
  analyticsTimeseriesQuerySchema,
  type AnalyticsHeatmapQueryDto,
  type AnalyticsKpisQueryDto,
  type AnalyticsLeaderboardQueryDto,
  type AnalyticsTimeseriesQueryDto,
} from './dto/analytics.schemas';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('kpis')
  getKpis(
    @Query(new ZodValidationPipe(analyticsKpisQuerySchema))
    query: AnalyticsKpisQueryDto,
  ): Promise<AnalyticsKpisResponse> {
    return this.analyticsService.getKpis(query);
  }

  @Get('timeseries')
  getTimeseries(
    @Query(new ZodValidationPipe(analyticsTimeseriesQuerySchema))
    query: AnalyticsTimeseriesQueryDto,
  ): Promise<AnalyticsTimeseriesResponse> {
    return this.analyticsService.getTimeseries(query);
  }

  @Get('leaderboards/templates')
  getTopTemplates(
    @Query(new ZodValidationPipe(analyticsLeaderboardQuerySchema))
    query: AnalyticsLeaderboardQueryDto,
  ): Promise<TemplateLeaderboardResponse> {
    return this.analyticsService.getTopTemplates(query);
  }

  @Get('leaderboards/accounts')
  getTopAccounts(
    @Query(new ZodValidationPipe(analyticsLeaderboardQuerySchema))
    query: AnalyticsLeaderboardQueryDto,
  ): Promise<AccountLeaderboardResponse> {
    return this.analyticsService.getTopAccounts(query);
  }

  @Get('leaderboards/emails')
  getTopEmails(
    @Query(new ZodValidationPipe(analyticsLeaderboardQuerySchema))
    query: AnalyticsLeaderboardQueryDto,
  ): Promise<TopEmailsResponse> {
    return this.analyticsService.getTopEmails(query);
  }

  @Get('leaderboards/links')
  getTopLinks(
    @Query(new ZodValidationPipe(analyticsLeaderboardQuerySchema))
    query: AnalyticsLeaderboardQueryDto,
  ): Promise<TopLinksResponse> {
    return this.analyticsService.getTopLinks(query);
  }

  @Get('leaderboards/customers')
  getTopCustomers(
    @Query(new ZodValidationPipe(analyticsLeaderboardQuerySchema))
    query: AnalyticsLeaderboardQueryDto,
  ): Promise<TopCustomersResponse> {
    return this.analyticsService.getTopCustomers(query);
  }

  @Get('heatmap')
  getHeatmap(
    @Query(new ZodValidationPipe(analyticsHeatmapQuerySchema))
    query: AnalyticsHeatmapQueryDto,
  ): Promise<SendTimeHeatmapResponse> {
    return this.analyticsService.getHeatmap(query);
  }
}
