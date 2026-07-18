import { Injectable, Logger } from '@nestjs/common';
import { TrackingEventsRepository } from '../database/tracking-events.repository';
import { SettingsService } from '../settings/settings.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const PARTITION_NAME_PATTERN = /^tracking_events_(\d{4})_(\d{2})$/;
// Keeps this many months of future partitions always created, so inserts
// never silently fall back to the tracking_events_default catch-all —
// the maintenance job the Task 2 migration left as a TODO.
const PARTITION_LOOKAHEAD_MONTHS = 3;

function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export interface EventPurgeResult {
  droppedPartitions: string[];
  ensuredPartitions: string[];
}

/**
 * GDPR raw-event purge (Task 21): drops tracking_events partitions entirely
 * past the configured retention.raw_events_days window — daily_stats
 * aggregates are untouched, so historical KPIs/charts keep working. Also
 * keeps a rolling window of future partitions created ahead of time.
 */
@Injectable()
export class EventPurgeService {
  private readonly logger = new Logger(EventPurgeService.name);

  constructor(
    private readonly trackingEventsRepository: TrackingEventsRepository,
    private readonly settingsService: SettingsService,
  ) {}

  async run(): Promise<EventPurgeResult> {
    const { rawEventsDays } = await this.settingsService.getRetention();
    const cutoffMonth = startOfMonthUtc(
      new Date(Date.now() - rawEventsDays * DAY_MS),
    );

    const partitionNames =
      await this.trackingEventsRepository.listPartitionNames();
    const droppedPartitions: string[] = [];
    for (const name of partitionNames) {
      const match = PARTITION_NAME_PATTERN.exec(name);
      if (!match) {
        continue;
      }
      const partitionMonth = new Date(
        Date.UTC(Number(match[1]), Number(match[2]) - 1, 1),
      );
      if (partitionMonth < cutoffMonth) {
        await this.trackingEventsRepository.dropPartition(name);
        droppedPartitions.push(name);
      }
    }
    if (droppedPartitions.length > 0) {
      this.logger.log(
        `Dropped expired tracking_events partitions: ${droppedPartitions.join(', ')}`,
      );
    }

    const ensuredPartitions: string[] = [];
    const now = new Date();
    for (let offset = 0; offset <= PARTITION_LOOKAHEAD_MONTHS; offset += 1) {
      const monthDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1),
      );
      await this.trackingEventsRepository.createPartition(monthDate);
      ensuredPartitions.push(monthDate.toISOString().slice(0, 7));
    }

    return { droppedPartitions, ensuredPartitions };
  }
}
