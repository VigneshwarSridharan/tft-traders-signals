import { computeNextRunAt } from './report-subscription-schedule.util';

describe('computeNextRunAt', () => {
  describe('daily', () => {
    it('schedules later today when the target hour has not passed', () => {
      const from = new Date('2026-07-19T05:00:00.000Z');
      const next = computeNextRunAt(
        { cadence: 'daily', hourOfDay: 8, dayOfWeek: null, dayOfMonth: null },
        from,
      );
      expect(next.toISOString()).toBe('2026-07-19T08:00:00.000Z');
    });

    it('rolls to tomorrow when the target hour already passed', () => {
      const from = new Date('2026-07-19T09:00:00.000Z');
      const next = computeNextRunAt(
        { cadence: 'daily', hourOfDay: 8, dayOfWeek: null, dayOfMonth: null },
        from,
      );
      expect(next.toISOString()).toBe('2026-07-20T08:00:00.000Z');
    });

    it('rolls to tomorrow when exactly at the target instant', () => {
      const from = new Date('2026-07-19T08:00:00.000Z');
      const next = computeNextRunAt(
        { cadence: 'daily', hourOfDay: 8, dayOfWeek: null, dayOfMonth: null },
        from,
      );
      expect(next.toISOString()).toBe('2026-07-20T08:00:00.000Z');
    });
  });

  describe('weekly', () => {
    it('schedules the next occurrence of dayOfWeek within the week', () => {
      // 2026-07-19 is a Sunday (day 0); target Wednesday (day 3).
      const from = new Date('2026-07-19T05:00:00.000Z');
      const next = computeNextRunAt(
        { cadence: 'weekly', hourOfDay: 8, dayOfWeek: 3, dayOfMonth: null },
        from,
      );
      expect(next.toISOString()).toBe('2026-07-22T08:00:00.000Z');
    });

    it('rolls a full week when the target day/hour already passed this week', () => {
      const from = new Date('2026-07-22T09:00:00.000Z');
      const next = computeNextRunAt(
        { cadence: 'weekly', hourOfDay: 8, dayOfWeek: 3, dayOfMonth: null },
        from,
      );
      expect(next.toISOString()).toBe('2026-07-29T08:00:00.000Z');
    });

    it('throws when dayOfWeek is missing', () => {
      expect(() =>
        computeNextRunAt(
          {
            cadence: 'weekly',
            hourOfDay: 8,
            dayOfWeek: null,
            dayOfMonth: null,
          },
          new Date(),
        ),
      ).toThrow();
    });
  });

  describe('monthly', () => {
    it('schedules later this month when the target date has not passed', () => {
      const from = new Date('2026-07-01T05:00:00.000Z');
      const next = computeNextRunAt(
        { cadence: 'monthly', hourOfDay: 8, dayOfWeek: null, dayOfMonth: 15 },
        from,
      );
      expect(next.toISOString()).toBe('2026-07-15T08:00:00.000Z');
    });

    it('rolls to next month when the target date already passed', () => {
      const from = new Date('2026-07-20T05:00:00.000Z');
      const next = computeNextRunAt(
        { cadence: 'monthly', hourOfDay: 8, dayOfWeek: null, dayOfMonth: 15 },
        from,
      );
      expect(next.toISOString()).toBe('2026-08-15T08:00:00.000Z');
    });

    it('handles a December-to-January year rollover', () => {
      const from = new Date('2026-12-20T05:00:00.000Z');
      const next = computeNextRunAt(
        { cadence: 'monthly', hourOfDay: 8, dayOfWeek: null, dayOfMonth: 15 },
        from,
      );
      expect(next.toISOString()).toBe('2027-01-15T08:00:00.000Z');
    });

    it('throws when dayOfMonth is missing', () => {
      expect(() =>
        computeNextRunAt(
          {
            cadence: 'monthly',
            hourOfDay: 8,
            dayOfWeek: null,
            dayOfMonth: null,
          },
          new Date(),
        ),
      ).toThrow();
    });
  });
});
