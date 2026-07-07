import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SendModule } from '../send/send.module';
import { ScheduledSendsController } from './scheduled-sends.controller';
import { ScheduledSendsService } from './scheduled-sends.service';

@Module({
  imports: [AuthModule, SendModule],
  controllers: [ScheduledSendsController],
  providers: [ScheduledSendsService],
})
export class ScheduledSendsModule {}
