import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { GeoLookupService } from './geo-lookup.service';
import { TrackingController } from './tracking.controller';
import { TrackingEventProcessorService } from './tracking-event-processor.service';
import { TrackingQueueService } from './tracking-queue.service';
import { TrackingRateLimiterService } from './tracking-rate-limiter.service';

@Module({
  imports: [NotificationsModule, WebhooksModule],
  controllers: [TrackingController],
  providers: [
    TrackingQueueService,
    TrackingRateLimiterService,
    TrackingEventProcessorService,
    GeoLookupService,
  ],
  exports: [TrackingEventProcessorService],
})
export class TrackingModule {}
