import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportsModule } from '../reports/reports.module';
import { SendModule } from '../send/send.module';
import { ReportSubscriptionsController } from './report-subscriptions.controller';
import { ReportSubscriptionsService } from './report-subscriptions.service';
import { ReportSubscriptionsQueueService } from './report-subscriptions-queue.service';
import { ReportSubscriptionRunnerService } from './report-subscription-runner.service';

@Module({
  imports: [AuthModule, ReportsModule, SendModule],
  controllers: [ReportSubscriptionsController],
  providers: [
    ReportSubscriptionsService,
    ReportSubscriptionsQueueService,
    ReportSubscriptionRunnerService,
  ],
  exports: [ReportSubscriptionRunnerService],
})
export class ReportSubscriptionsModule {}
