import { Injectable, Logger } from '@nestjs/common';
import { DailyStatsRepository } from '../database/daily-stats.repository';
import { addUtcDays, startOfUtcDay } from './period.util';

/**
 * Recomputes today and yesterday (UTC) on every run rather than tracking a
 * watermark: the repository's UPSERT is idempotent, so this self-corrects
 * for events that land after midnight (a late bounce, an open on a message
 * sent the previous day) without needing separate backfill logic.
 */
@Injectable()
export class StatsRollupService {
  private readonly logger = new Logger(StatsRollupService.name);

  constructor(private readonly dailyStatsRepository: DailyStatsRepository) {}

  async run(sinceDay?: Date): Promise<void> {
    const untilDay = startOfUtcDay(new Date());
    const fromDay = sinceDay
      ? startOfUtcDay(sinceDay)
      : addUtcDays(untilDay, -1);

    const rowCount = await this.dailyStatsRepository.rollupRange(
      fromDay,
      untilDay,
    );
    this.logger.log(
      `Rolled up daily_stats for ${fromDay.toISOString().slice(0, 10)}..${untilDay
        .toISOString()
        .slice(0, 10)} (${rowCount} row(s) upserted).`,
    );
  }
}
