import { Module } from '@nestjs/common';
import { DeliveryHeuristicService } from './delivery-heuristic.service';
import { InboundQueueService } from './inbound-queue.service';
import { InboundSyncService } from './inbound-sync.service';

@Module({
  providers: [
    InboundQueueService,
    InboundSyncService,
    DeliveryHeuristicService,
  ],
  exports: [InboundSyncService, DeliveryHeuristicService],
})
export class InboundModule {}
