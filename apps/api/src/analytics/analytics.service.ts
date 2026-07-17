import { Injectable } from '@nestjs/common';
import type {
  AnalyticsKpisResponse,
  AnalyticsTimeseriesResponse,
  KpiDeltas,
  KpiSet,
} from '@tft/shared';
import {
  DailyStatsRepository,
  type DailyStatsAggregate,
  type DailyStatsFilter,
} from '../database/daily-stats.repository';
import type {
  AnalyticsKpisQueryDto,
  AnalyticsTimeseriesQueryDto,
} from './dto/analytics.schemas';
import { previousPeriod, resolvePeriod, toDateOnlyString } from './period.util';

const RATE_METRICS = new Set<keyof KpiSet>([
  'deliveryRate',
  'openRate',
  'ctr',
  'ctor',
  'bounceRate',
  'replyRate',
]);

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function computeKpiSet(agg: DailyStatsAggregate): KpiSet {
  const bounced = agg.bouncedHard + agg.bouncedSoft;
  return {
    sent: agg.sent,
    delivered: agg.delivered,
    deliveryRate: rate(agg.delivered, agg.sent),
    opensTotal: agg.opensTotal,
    opensUnique: agg.opensUnique,
    openRate: rate(agg.opensUnique, agg.delivered),
    clicksTotal: agg.clicksTotal,
    clicksUnique: agg.clicksUnique,
    ctr: rate(agg.clicksUnique, agg.delivered),
    ctor: rate(agg.clicksUnique, agg.opensUnique),
    bouncedHard: agg.bouncedHard,
    bouncedSoft: agg.bouncedSoft,
    bounceRate: rate(bounced, agg.sent),
    replies: agg.replies,
    replyRate: rate(agg.replies, agg.delivered),
    unsubscribes: agg.unsubscribes,
  };
}

/** Count metrics get percent change; rate metrics (already ratios) get an absolute/percentage-point difference. `null` means there's no previous-period baseline (previous was 0) to compare against. */
export function computeKpiDeltas(current: KpiSet, previous: KpiSet): KpiDeltas {
  const deltas = {} as KpiDeltas;
  for (const key of Object.keys(current) as (keyof KpiSet)[]) {
    const curr = current[key];
    const prev = previous[key];
    if (RATE_METRICS.has(key)) {
      deltas[key] = curr - prev;
    } else if (prev === 0) {
      deltas[key] = curr === 0 ? 0 : null;
    } else {
      deltas[key] = ((curr - prev) / prev) * 100;
    }
  }
  return deltas;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly dailyStatsRepository: DailyStatsRepository) {}

  async getKpis(query: AnalyticsKpisQueryDto): Promise<AnalyticsKpisResponse> {
    const period = resolvePeriod(query.dateFrom, query.dateTo);
    const previous = previousPeriod(period);
    const filter: DailyStatsFilter = {
      senderAccountId: query.senderAccountId,
      templateId: query.templateId,
    };

    const [currentAgg, previousAgg] = await Promise.all([
      this.dailyStatsRepository.sumRange(
        period.dateFrom,
        period.dateTo,
        filter,
      ),
      this.dailyStatsRepository.sumRange(
        previous.dateFrom,
        previous.dateTo,
        filter,
      ),
    ]);

    const current = computeKpiSet(currentAgg);
    const previousKpis = computeKpiSet(previousAgg);

    return {
      current,
      previous: previousKpis,
      deltas: computeKpiDeltas(current, previousKpis),
      currentPeriod: {
        dateFrom: toDateOnlyString(period.dateFrom),
        dateTo: toDateOnlyString(period.dateTo),
      },
      previousPeriod: {
        dateFrom: toDateOnlyString(previous.dateFrom),
        dateTo: toDateOnlyString(previous.dateTo),
      },
    };
  }

  async getTimeseries(
    query: AnalyticsTimeseriesQueryDto,
  ): Promise<AnalyticsTimeseriesResponse> {
    const period = resolvePeriod(query.dateFrom, query.dateTo);
    const filter: DailyStatsFilter = {
      senderAccountId: query.senderAccountId,
      templateId: query.templateId,
    };

    const points = await this.dailyStatsRepository.timeseries(
      period.dateFrom,
      period.dateTo,
      query.grain,
      filter,
    );

    return points.map((point) => ({
      periodStart: toDateOnlyString(point.periodStart),
      sent: point.sent,
      delivered: point.delivered,
      opensTotal: point.opensTotal,
      opensUnique: point.opensUnique,
      clicksTotal: point.clicksTotal,
      clicksUnique: point.clicksUnique,
    }));
  }
}
