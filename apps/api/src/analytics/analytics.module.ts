import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { StatsRollupQueueService } from './stats-rollup-queue.service';
import { StatsRollupService } from './stats-rollup.service';

@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, StatsRollupService, StatsRollupQueueService],
  exports: [StatsRollupService, AnalyticsService],
})
export class AnalyticsModule {}
