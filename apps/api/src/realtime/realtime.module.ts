import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeController } from './realtime.controller';
import { RealtimeEventsService } from './realtime-events.service';

@Module({
  imports: [AuthModule],
  controllers: [RealtimeController],
  providers: [RealtimeEventsService],
})
export class RealtimeModule {}
