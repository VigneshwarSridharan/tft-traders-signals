import { Injectable, Logger } from '@nestjs/common';
import { TrackingEventsRepository } from '../database/tracking-events.repository';
import { SettingsService } from '../settings/settings.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** GDPR IP truncation (Task 21): coarsens tracking_events.ip past the configured retention.pii_days window. */
@Injectable()
export class IpTruncationService {
  private readonly logger = new Logger(IpTruncationService.name);

  constructor(
    private readonly trackingEventsRepository: TrackingEventsRepository,
    private readonly settingsService: SettingsService,
  ) {}

  async run(): Promise<number> {
    const { piiDays } = await this.settingsService.getRetention();
    const cutoff = new Date(Date.now() - piiDays * DAY_MS);
    const truncated =
      await this.trackingEventsRepository.truncateIpsOlderThan(cutoff);
    if (truncated > 0) {
      this.logger.log(
        `Truncated IPs on ${truncated} tracking_events row(s) older than ${cutoff.toISOString()}`,
      );
    }
    return truncated;
  }
}
