import {
  AnalyticsService,
  computeKpiDeltas,
  computeKpiSet,
} from './analytics.service';
import type {
  DailyStatsAggregate,
  DailyStatsRepository,
} from '../database/daily-stats.repository';

function buildAggregate(
  overrides: Partial<DailyStatsAggregate> = {},
): DailyStatsAggregate {
  return {
    sent: 0,
    delivered: 0,
    bouncedHard: 0,
    bouncedSoft: 0,
    opensTotal: 0,
    opensUnique: 0,
    clicksTotal: 0,
    clicksUnique: 0,
    replies: 0,
    unsubscribes: 0,
    ...overrides,
  };
}

describe('computeKpiSet', () => {
  it('computes rates from raw counts using fixed inputs', () => {
    const agg = buildAggregate({
      sent: 100,
      delivered: 90,
      bouncedHard: 6,
      bouncedSoft: 4,
      opensTotal: 150,
      opensUnique: 60,
      clicksTotal: 40,
      clicksUnique: 20,
      replies: 9,
      unsubscribes: 2,
    });

    const kpis = computeKpiSet(agg);

    expect(kpis.sent).toBe(100);
    expect(kpis.delivered).toBe(90);
    expect(kpis.deliveryRate).toBeCloseTo(0.9);
    expect(kpis.opensTotal).toBe(150);
    expect(kpis.opensUnique).toBe(60);
    expect(kpis.openRate).toBeCloseTo(60 / 90);
    expect(kpis.clicksTotal).toBe(40);
    expect(kpis.clicksUnique).toBe(20);
    expect(kpis.ctr).toBeCloseTo(20 / 90);
    expect(kpis.ctor).toBeCloseTo(20 / 60);
    expect(kpis.bouncedHard).toBe(6);
    expect(kpis.bouncedSoft).toBe(4);
    expect(kpis.bounceRate).toBeCloseTo(10 / 100);
    expect(kpis.replies).toBe(9);
    expect(kpis.replyRate).toBeCloseTo(9 / 90);
    expect(kpis.unsubscribes).toBe(2);
  });

  it('treats zero denominators as a zero rate instead of NaN/Infinity', () => {
    const kpis = computeKpiSet(buildAggregate());

    expect(kpis.deliveryRate).toBe(0);
    expect(kpis.openRate).toBe(0);
    expect(kpis.ctr).toBe(0);
    expect(kpis.ctor).toBe(0);
    expect(kpis.bounceRate).toBe(0);
    expect(kpis.replyRate).toBe(0);
  });
});

describe('computeKpiDeltas', () => {
  it('computes percent change for count metrics and pp difference for rate metrics', () => {
    const previous = computeKpiSet(
      buildAggregate({
        sent: 100,
        delivered: 80,
        opensUnique: 40,
        clicksUnique: 10,
      }),
    );
    const current = computeKpiSet(
      buildAggregate({
        sent: 150,
        delivered: 120,
        opensUnique: 72,
        clicksUnique: 24,
      }),
    );

    const deltas = computeKpiDeltas(current, previous);

    // count metric: (150 - 100) / 100 * 100 = 50%
    expect(deltas.sent).toBeCloseTo(50);
    // count metric: (120 - 80) / 80 * 100 = 50%
    expect(deltas.delivered).toBeCloseTo(50);
    // rate metric: previous deliveryRate 0.8, current 0.8 -> pp diff 0
    expect(deltas.deliveryRate).toBeCloseTo(0);
    // openRate: previous 40/80=0.5, current 72/120=0.6 -> +0.1
    expect(deltas.openRate).toBeCloseTo(0.1);
  });

  it('returns null for a count metric with no previous-period baseline', () => {
    const previous = computeKpiSet(buildAggregate({ sent: 0, delivered: 0 }));
    const current = computeKpiSet(buildAggregate({ sent: 10, delivered: 8 }));

    const deltas = computeKpiDeltas(current, previous);

    expect(deltas.sent).toBeNull();
  });

  it('returns 0 for a count metric that stayed at zero across both periods', () => {
    const previous = computeKpiSet(buildAggregate());
    const current = computeKpiSet(buildAggregate());

    const deltas = computeKpiDeltas(current, previous);

    expect(deltas.sent).toBe(0);
  });
});

describe('AnalyticsService.getKpis', () => {
  it('queries the current and previous periods with the same filter and combines them', async () => {
    const sumRange = jest
      .fn()
      .mockResolvedValueOnce(
        buildAggregate({ sent: 20, delivered: 18, opensUnique: 9 }),
      )
      .mockResolvedValueOnce(
        buildAggregate({ sent: 10, delivered: 9, opensUnique: 3 }),
      );
    const dailyStatsRepository = {
      sumRange,
    } as unknown as jest.Mocked<DailyStatsRepository>;

    const service = new AnalyticsService(dailyStatsRepository);

    const response = await service.getKpis({
      dateFrom: new Date('2026-07-10T00:00:00Z'),
      dateTo: new Date('2026-07-16T00:00:00Z'),
      senderAccountId: 'sender-1',
    });

    expect(sumRange).toHaveBeenCalledTimes(2);
    expect(sumRange).toHaveBeenNthCalledWith(
      1,
      new Date('2026-07-10T00:00:00.000Z'),
      new Date('2026-07-16T00:00:00.000Z'),
      { senderAccountId: 'sender-1', templateId: undefined },
    );
    // previous period is the same 7-day length immediately before dateFrom
    expect(sumRange).toHaveBeenNthCalledWith(
      2,
      new Date('2026-07-03T00:00:00.000Z'),
      new Date('2026-07-09T00:00:00.000Z'),
      { senderAccountId: 'sender-1', templateId: undefined },
    );

    expect(response.current.sent).toBe(20);
    expect(response.previous.sent).toBe(10);
    expect(response.deltas.sent).toBeCloseTo(100);
    expect(response.currentPeriod).toEqual({
      dateFrom: '2026-07-10',
      dateTo: '2026-07-16',
    });
    expect(response.previousPeriod).toEqual({
      dateFrom: '2026-07-03',
      dateTo: '2026-07-09',
    });
  });
});
