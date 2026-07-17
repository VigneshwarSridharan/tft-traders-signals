import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type {
  AnalyticsKpisResponse,
  AnalyticsTimeseriesResponse,
} from '@tft/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AnalyticsService } from './analytics.service';
import {
  analyticsKpisQuerySchema,
  analyticsTimeseriesQuerySchema,
  type AnalyticsKpisQueryDto,
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
}
