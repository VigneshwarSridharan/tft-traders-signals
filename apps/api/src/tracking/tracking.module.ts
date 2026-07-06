import { Module } from '@nestjs/common';
import { GeoLookupService } from './geo-lookup.service';
import { TrackingController } from './tracking.controller';
import { TrackingEventProcessorService } from './tracking-event-processor.service';
import { TrackingQueueService } from './tracking-queue.service';
import { TrackingRateLimiterService } from './tracking-rate-limiter.service';

@Module({
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
