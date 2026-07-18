import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { UnsubscribeController } from './unsubscribe.controller';
import { UnsubscribeService } from './unsubscribe.service';

@Module({
  imports: [WebhooksModule],
  controllers: [UnsubscribeController],
  providers: [UnsubscribeService],
})
export class UnsubscribeModule {}
