import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebhookDeliveryQueueService } from './webhook-delivery-queue.service';
import { WebhookDeliveryWorkerService } from './webhook-delivery-worker.service';
import { WebhookDispatchService } from './webhook-dispatch.service';
import { WebhookEndpointsController } from './webhook-endpoints.controller';
import { WebhookEndpointsService } from './webhook-endpoints.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [WebhookEndpointsController],
  providers: [
    WebhookEndpointsService,
    WebhookDeliveryQueueService,
    WebhookDispatchService,
    WebhookDeliveryWorkerService,
  ],
  exports: [WebhookDispatchService, WebhookDeliveryWorkerService],
})
export class WebhooksModule {}
