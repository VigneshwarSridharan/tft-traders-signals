import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type {
  AnalyticsKpisResponse,
  AnalyticsTimeseriesResponse,
} from '@tft/shared';
import { RequireScopes } from '../auth/decorators/scopes.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiKeyAuthGuard } from '../auth/guards/api-key-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ScopesGuard } from '../auth/guards/scopes.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  analyticsKpisQuerySchema,
  analyticsTimeseriesQuerySchema,
  type AnalyticsKpisQueryDto,
  type AnalyticsTimeseriesQueryDto,
} from '../analytics/dto/analytics.schemas';
import { ApiKeyRateLimitGuard } from './api-key-rate-limit.guard';

@Controller('v1/analytics')
@UseGuards(ApiKeyAuthGuard, RolesGuard, ScopesGuard, ApiKeyRateLimitGuard)
@Roles('admin', 'manager', 'viewer')
@RequireScopes('read:analytics')
export class PublicApiAnalyticsController {
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
}
