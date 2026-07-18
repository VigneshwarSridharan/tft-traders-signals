import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailSenderService } from './email-sender.service';
import { SendQueueService } from './send-queue.service';

@Module({
  imports: [NotificationsModule],
  providers: [SendQueueService, EmailSenderService],
  exports: [SendQueueService, EmailSenderService],
})
export class SendModule {}
