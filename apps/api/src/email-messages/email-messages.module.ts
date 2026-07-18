import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SendModule } from '../send/send.module';
import { SettingsModule } from '../settings/settings.module';
import { EmailMessagesController } from './email-messages.controller';
import { EmailMessagesService } from './email-messages.service';

@Module({
  imports: [AuthModule, SendModule, SettingsModule],
  controllers: [EmailMessagesController],
  providers: [EmailMessagesService],
  exports: [EmailMessagesService],
})
export class EmailMessagesModule {}
