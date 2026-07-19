import type { ReportSubscriptionCadence } from '@tft/shared';

export interface ReportSubscriptionSchedule {
  cadence: ReportSubscriptionCadence;
  hourOfDay: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
}

/**
 * Computes the next UTC run time strictly after `from`, per the
 * subscription's cadence/hour/day fields. Monthly day-of-month is expected
 * pre-capped to 1-28 (enforced by the report_subscriptions CHECK
 * constraint) so every month has that day.
 */
export function computeNextRunAt(
  schedule: ReportSubscriptionSchedule,
  from: Date,
): Date {
  const candidate = new Date(from);
  candidate.setUTCHours(schedule.hourOfDay, 0, 0, 0);

  switch (schedule.cadence) {
    case 'daily': {
      if (candidate <= from) {
        candidate.setUTCDate(candidate.getUTCDate() + 1);
      }
      return candidate;
    }
    case 'weekly': {
      const targetDay = schedule.dayOfWeek;
      if (targetDay === null) {
        throw new Error('Weekly cadence requires dayOfWeek');
      }
      let daysToAdd = (targetDay - candidate.getUTCDay() + 7) % 7;
      if (daysToAdd === 0 && candidate <= from) {
        daysToAdd = 7;
      }
      candidate.setUTCDate(candidate.getUTCDate() + daysToAdd);
      return candidate;
    }
    case 'monthly': {
      const targetDate = schedule.dayOfMonth;
      if (targetDate === null) {
        throw new Error('Monthly cadence requires dayOfMonth');
      }
      candidate.setUTCDate(targetDate);
      if (candidate <= from) {
        candidate.setUTCMonth(candidate.getUTCMonth() + 1);
        candidate.setUTCDate(targetDate);
      }
      return candidate;
    }
  }
}
