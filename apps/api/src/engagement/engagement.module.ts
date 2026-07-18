import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { EngagementQueueService } from './engagement-queue.service';
import { EngagementRollupService } from './engagement-rollup.service';

@Module({
  imports: [NotificationsModule],
  providers: [EngagementRollupService, EngagementQueueService],
  exports: [EngagementRollupService],
})
export class EngagementModule {}
