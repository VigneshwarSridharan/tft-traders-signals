import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SendModule } from '../send/send.module';
import { EmailMessagesController } from './email-messages.controller';
import { EmailMessagesService } from './email-messages.service';

@Module({
  imports: [AuthModule, SendModule],
  controllers: [EmailMessagesController],
  providers: [EmailMessagesService],
})
export class EmailMessagesModule {}
