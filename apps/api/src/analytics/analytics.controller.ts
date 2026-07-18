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
import { Roles } from '../auth/decorators/roles.decorator';
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

/**
 * Org-wide analytics come from the daily_stats rollup, which aggregates
 * across all users (day × sender account × template — no per-user
 * dimension), so it can't be scoped to "my sends only". Agents get their
 * own send/open/click/bounce numbers per-message via the sent-mail list
 * instead (see SentMailController), which is ownership-filtered.
 */
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'manager', 'viewer')
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
