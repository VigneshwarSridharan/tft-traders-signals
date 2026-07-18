import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { EmailSenderService } from './email-sender.service';
import { SendQueueService } from './send-queue.service';

@Module({
  imports: [NotificationsModule, WebhooksModule],
  providers: [SendQueueService, EmailSenderService],
  exports: [SendQueueService, EmailSenderService],
})
export class SendModule {}
