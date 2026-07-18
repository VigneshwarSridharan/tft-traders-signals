import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { ComplianceQueueService } from './compliance-queue.service';
import { EventPurgeService } from './event-purge.service';
import { IpTruncationService } from './ip-truncation.service';

@Module({
  imports: [SettingsModule],
  providers: [ComplianceQueueService, IpTruncationService, EventPurgeService],
  exports: [IpTruncationService, EventPurgeService],
})
export class ComplianceModule {}
