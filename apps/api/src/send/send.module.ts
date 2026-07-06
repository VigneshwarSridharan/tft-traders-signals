import { Module } from '@nestjs/common';
import { EmailSenderService } from './email-sender.service';
import { SendQueueService } from './send-queue.service';

@Module({
  providers: [SendQueueService, EmailSenderService],
  exports: [SendQueueService, EmailSenderService],
})
export class SendModule {}
