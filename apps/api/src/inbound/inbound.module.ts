import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { DeliveryHeuristicService } from './delivery-heuristic.service';
import { InboundQueueService } from './inbound-queue.service';
import { InboundSyncService } from './inbound-sync.service';

@Module({
  imports: [NotificationsModule, WebhooksModule],
  providers: [
    InboundQueueService,
    InboundSyncService,
    DeliveryHeuristicService,
  ],
  exports: [InboundSyncService, DeliveryHeuristicService],
})
export class InboundModule {}
