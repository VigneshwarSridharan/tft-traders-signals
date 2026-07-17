export interface KpiSet {
  sent: number;
  delivered: number;
  deliveryRate: number;
  opensTotal: number;
  opensUnique: number;
  openRate: number;
  clicksTotal: number;
  clicksUnique: number;
  ctr: number;
  ctor: number;
  bouncedHard: number;
  bouncedSoft: number;
  bounceRate: number;
  replies: number;
  replyRate: number;
  unsubscribes: number;
}

/** Percent change current-vs-previous for count metrics; absolute (percentage-point) change for rate metrics. `null` when there is no previous-period baseline to compare against (previous = 0). */
export type KpiDeltas = Record<keyof KpiSet, number | null>;

export interface AnalyticsPeriod {
  dateFrom: string;
  dateTo: string;
}

export interface AnalyticsKpisQuery {
  dateFrom?: string;
  dateTo?: string;
  senderAccountId?: string;
  templateId?: string;
}

export interface AnalyticsKpisResponse {
  current: KpiSet;
  previous: KpiSet;
  deltas: KpiDeltas;
  currentPeriod: AnalyticsPeriod;
  previousPeriod: AnalyticsPeriod;
}

export const ANALYTICS_TIMESERIES_GRAINS = [
  "day",
  "week",
  "month",
  "year",
] as const;

export type AnalyticsTimeseriesGrain =
  (typeof ANALYTICS_TIMESERIES_GRAINS)[number];

export interface AnalyticsTimeseriesQuery {
  dateFrom?: string;
  dateTo?: string;
  grain?: AnalyticsTimeseriesGrain;
  senderAccountId?: string;
  templateId?: string;
}

export interface AnalyticsTimeseriesPoint {
  periodStart: string;
  sent: number;
  delivered: number;
  opensTotal: number;
  opensUnique: number;
  clicksTotal: number;
  clicksUnique: number;
}

export type AnalyticsTimeseriesResponse = AnalyticsTimeseriesPoint[];
