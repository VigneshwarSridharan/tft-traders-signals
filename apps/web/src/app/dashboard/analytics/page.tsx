"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ANALYTICS_TIMESERIES_GRAINS,
  type AccountLeaderboardResponse,
  type AnalyticsKpisResponse,
  type AnalyticsTimeseriesGrain,
  type AnalyticsTimeseriesResponse,
  type ComposeSenderAccountOption,
  type EmailTemplateSummary,
  type KpiSet,
  type SendTimeHeatmapResponse,
  type TemplateLeaderboardResponse,
  type TopCustomersResponse,
  type TopEmailsResponse,
  type TopLinksResponse,
} from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";
import { RequireRole } from "@/components/require-role";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

const CARD_CLASS =
  "rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Preset = "7" | "30" | "90" | "custom";

function isoDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(
    value,
  );
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** count metrics report % change; rate metrics (already ratios) report a percentage-point diff. */
function formatDelta(value: number | null, isRateMetric: boolean): string {
  if (value === null) return "new";
  const sign = value > 0 ? "+" : "";
  return isRateMetric
    ? `${sign}${value.toFixed(1)}pp`
    : `${sign}${value.toFixed(1)}%`;
}

const RATE_KEYS = new Set<keyof KpiSet>([
  "deliveryRate",
  "openRate",
  "ctr",
  "ctor",
  "bounceRate",
  "replyRate",
]);

/** Whether an increase in this metric is good news (drives the delta badge color); metrics omitted here (e.g. "sent") are treated as neutral. */
const HIGHER_IS_BETTER: Partial<Record<keyof KpiSet, boolean>> = {
  delivered: true,
  deliveryRate: true,
  opensTotal: true,
  opensUnique: true,
  openRate: true,
  clicksTotal: true,
  clicksUnique: true,
  ctr: true,
  ctor: true,
  bouncedHard: false,
  bouncedSoft: false,
  bounceRate: false,
  replies: true,
  replyRate: true,
  unsubscribes: false,
};

function deltaColorClass(metric: keyof KpiSet, delta: number | null): string {
  if (delta === null || delta === 0) return "text-zinc-500 dark:text-zinc-400";
  const higherIsBetter = HIGHER_IS_BETTER[metric];
  if (higherIsBetter === undefined) return "text-zinc-500 dark:text-zinc-400";
  const isGood = higherIsBetter ? delta > 0 : delta < 0;
  return isGood
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
}

interface KpiTileSpec {
  label: string;
  metric: keyof KpiSet;
  primary: (kpis: KpiSet) => string;
  secondary?: (kpis: KpiSet) => string;
}

const KPI_TILES: KpiTileSpec[] = [
  { label: "Sent", metric: "sent", primary: (k) => compactNumber(k.sent) },
  {
    label: "Delivered",
    metric: "delivered",
    primary: (k) => compactNumber(k.delivered),
  },
  {
    label: "Delivery rate",
    metric: "deliveryRate",
    primary: (k) => formatPercent(k.deliveryRate),
  },
  {
    label: "Opens",
    metric: "opensUnique",
    primary: (k) => compactNumber(k.opensUnique),
    secondary: (k) => `${compactNumber(k.opensTotal)} total`,
  },
  {
    label: "Open rate",
    metric: "openRate",
    primary: (k) => formatPercent(k.openRate),
  },
  {
    label: "Clicks",
    metric: "clicksUnique",
    primary: (k) => compactNumber(k.clicksUnique),
    secondary: (k) => `${compactNumber(k.clicksTotal)} total`,
  },
  { label: "CTR", metric: "ctr", primary: (k) => formatPercent(k.ctr) },
  { label: "CTOR", metric: "ctor", primary: (k) => formatPercent(k.ctor) },
  {
    label: "Bounce rate",
    metric: "bounceRate",
    primary: (k) => formatPercent(k.bounceRate),
  },
  {
    label: "Reply rate",
    metric: "replyRate",
    primary: (k) => formatPercent(k.replyRate),
  },
];

export default function AnalyticsPage() {
  return (
    <RequireRole roles={["admin", "manager", "viewer"]}>
      <AnalyticsPageContent />
    </RequireRole>
  );
}

function AnalyticsPageContent() {
  const [preset, setPreset] = useState<Preset>("30");
  const [dateFrom, setDateFrom] = useState(isoDateNDaysAgo(29));
  const [dateTo, setDateTo] = useState(todayIso());
  const [senderAccountId, setSenderAccountId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [grain, setGrain] = useState<AnalyticsTimeseriesGrain>("day");

  const [senderAccounts, setSenderAccounts] = useState<
    ComposeSenderAccountOption[]
  >([]);
  const [templates, setTemplates] = useState<EmailTemplateSummary[]>([]);

  const [kpis, setKpis] = useState<AnalyticsKpisResponse | null>(null);
  const [timeseries, setTimeseries] = useState<AnalyticsTimeseriesResponse>(
    [],
  );
  const [topTemplates, setTopTemplates] = useState<TemplateLeaderboardResponse>(
    [],
  );
  const [topAccounts, setTopAccounts] = useState<AccountLeaderboardResponse>(
    [],
  );
  const [topEmails, setTopEmails] = useState<TopEmailsResponse>([]);
  const [topLinks, setTopLinks] = useState<TopLinksResponse>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomersResponse>([]);
  const [heatmap, setHeatmap] = useState<SendTimeHeatmapResponse>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [senderAccountList, templateList] = await Promise.all([
          apiFetch<ComposeSenderAccountOption[]>(
            "/email-messages/sender-accounts",
          ),
          apiFetch<EmailTemplateSummary[]>("/templates"),
        ]);
        setSenderAccounts(senderAccountList);
        setTemplates(templateList);
      } catch {
        // Reference data is optional; filters just render fewer options.
      }
    })();
  }, []);

  function applyPreset(next: Preset) {
    setPreset(next);
    if (next === "custom") return;
    setDateTo(todayIso());
    setDateFrom(isoDateNDaysAgo(Number(next) - 1));
  }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const baseParams = new URLSearchParams();
      baseParams.set("dateFrom", dateFrom);
      baseParams.set("dateTo", dateTo);
      if (senderAccountId) baseParams.set("senderAccountId", senderAccountId);
      if (templateId) baseParams.set("templateId", templateId);

      const timeseriesParams = new URLSearchParams(baseParams);
      timeseriesParams.set("grain", grain);

      const [
        kpisResult,
        timeseriesResult,
        topTemplatesResult,
        topAccountsResult,
        topEmailsResult,
        topLinksResult,
        topCustomersResult,
        heatmapResult,
      ] = await Promise.all([
        apiFetch<AnalyticsKpisResponse>(`/analytics/kpis?${baseParams}`),
        apiFetch<AnalyticsTimeseriesResponse>(
          `/analytics/timeseries?${timeseriesParams}`,
        ),
        apiFetch<TemplateLeaderboardResponse>(
          `/analytics/leaderboards/templates?${baseParams}`,
        ),
        apiFetch<AccountLeaderboardResponse>(
          `/analytics/leaderboards/accounts?${baseParams}`,
        ),
        apiFetch<TopEmailsResponse>(
          `/analytics/leaderboards/emails?${baseParams}`,
        ),
        apiFetch<TopLinksResponse>(
          `/analytics/leaderboards/links?${baseParams}`,
        ),
        apiFetch<TopCustomersResponse>(
          `/analytics/leaderboards/customers?${baseParams}`,
        ),
        apiFetch<SendTimeHeatmapResponse>(`/analytics/heatmap?${baseParams}`),
      ]);

      setKpis(kpisResult);
      setTimeseries(timeseriesResult);
      setTopTemplates(topTemplatesResult);
      setTopAccounts(topAccountsResult);
      setTopEmails(topEmailsResult);
      setTopLinks(topLinksResult);
      setTopCustomers(topCustomersResult);
      setHeatmap(heatmapResult);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load analytics",
      );
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, senderAccountId, templateId, grain]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch analytics when filters change
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Analytics
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Engagement KPIs, activity over time, leaderboards, and the best time
          to send.
        </p>
      </div>

      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      )}

      <FilterBar
        preset={preset}
        onPreset={applyPreset}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFrom={(v) => {
          setPreset("custom");
          setDateFrom(v);
        }}
        onDateTo={(v) => {
          setPreset("custom");
          setDateTo(v);
        }}
        senderAccountId={senderAccountId}
        onSenderAccountId={setSenderAccountId}
        senderAccounts={senderAccounts}
        templateId={templateId}
        onTemplateId={setTemplateId}
        templates={templates}
      />

      {kpis && <KpiTiles kpis={kpis} />}

      <section className={CARD_CLASS}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Activity over time
          </h2>
          <div className="flex gap-1">
            {ANALYTICS_TIMESERIES_GRAINS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGrain(g)}
                className={`rounded-md px-2 py-1 text-xs font-medium capitalize transition ${
                  grain === g
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <TimeSeriesChart points={timeseries} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ComparisonPanel
          title="Templates — comparison &amp; leaderboard"
          entries={topTemplates.map((t) => ({
            id: t.templateId,
            label: t.templateName,
            sublabel: t.categoryName,
            value: t.openRate,
          }))}
          valueLabel="open rate"
          formatValue={formatPercent}
        />
        <ComparisonPanel
          title="Sender accounts — comparison &amp; leaderboard"
          entries={topAccounts.map((a) => ({
            id: a.senderAccountId,
            label: a.senderAccountDisplayName ?? a.senderAccountEmail,
            sublabel: a.senderAccountEmail,
            value: a.openRate,
          }))}
          valueLabel="open rate"
          formatValue={formatPercent}
        />
      </div>

      <section className={CARD_CLASS}>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Best time to send
        </h2>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          Real opens (bot traffic excluded) by weekday and hour, UTC.
        </p>
        <Heatmap points={heatmap} />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <LeaderboardCard title="Most-opened emails">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="text-zinc-600 dark:text-zinc-400">
              <tr>
                <th className="px-2 py-1.5 font-medium">Recipient / subject</th>
                <th className="px-2 py-1.5 text-right font-medium">Opens</th>
                <th className="px-2 py-1.5 text-right font-medium">Clicks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {topEmails.length === 0 && !loading && <EmptyRow colSpan={3} />}
              {topEmails.map((email) => (
                <tr key={email.messageId}>
                  <td className="max-w-xs truncate px-2 py-1.5">
                    <div className="font-medium text-zinc-900 dark:text-zinc-50">
                      {email.subject ?? "—"}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {email.toName ?? email.toEmail}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {email.openCount}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {email.clickCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </LeaderboardCard>

        <LeaderboardCard title="Most-clicked links">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="text-zinc-600 dark:text-zinc-400">
              <tr>
                <th className="px-2 py-1.5 font-medium">Link</th>
                <th className="px-2 py-1.5 text-right font-medium">Clicks</th>
                <th className="px-2 py-1.5 text-right font-medium">Sends</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {topLinks.length === 0 && !loading && <EmptyRow colSpan={3} />}
              {topLinks.map((link) => (
                <tr key={link.originalUrl}>
                  <td className="max-w-xs truncate px-2 py-1.5">
                    <div className="font-medium text-zinc-900 dark:text-zinc-50">
                      {link.linkLabel ?? link.originalUrl}
                    </div>
                    <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {link.originalUrl}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {link.totalClicks}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {link.timesSent}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </LeaderboardCard>

        <LeaderboardCard title="Most-engaged customers" className="xl:col-span-2">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-zinc-600 dark:text-zinc-400">
              <tr>
                <th className="px-2 py-1.5 font-medium">Customer</th>
                <th className="px-2 py-1.5 text-right font-medium">Sent</th>
                <th className="px-2 py-1.5 text-right font-medium">Opens</th>
                <th className="px-2 py-1.5 text-right font-medium">Clicks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {topCustomers.length === 0 && !loading && (
                <EmptyRow colSpan={4} />
              )}
              {topCustomers.map((customer) => (
                <tr key={customer.customerId}>
                  <td className="px-2 py-1.5">
                    <div className="font-medium text-zinc-900 dark:text-zinc-50">
                      {customer.name}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {customer.company ?? customer.email}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {customer.sent}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {customer.opensTotal}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {customer.clicksTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </LeaderboardCard>
      </div>
    </div>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-2 py-4 text-center text-zinc-500 dark:text-zinc-400"
      >
        No data for this period.
      </td>
    </tr>
  );
}

function LeaderboardCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`${CARD_CLASS} ${className}`}>
      <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        {title}
      </h2>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function FilterBar({
  preset,
  onPreset,
  dateFrom,
  dateTo,
  onDateFrom,
  onDateTo,
  senderAccountId,
  onSenderAccountId,
  senderAccounts,
  templateId,
  onTemplateId,
  templates,
}: {
  preset: Preset;
  onPreset: (p: Preset) => void;
  dateFrom: string;
  dateTo: string;
  onDateFrom: (v: string) => void;
  onDateTo: (v: string) => void;
  senderAccountId: string;
  onSenderAccountId: (v: string) => void;
  senderAccounts: ComposeSenderAccountOption[];
  templateId: string;
  onTemplateId: (v: string) => void;
  templates: EmailTemplateSummary[];
}) {
  const presets: { value: Preset; label: string }[] = [
    { value: "7", label: "7 days" },
    { value: "30", label: "30 days" },
    { value: "90", label: "90 days" },
  ];

  return (
    <section className={CARD_CLASS}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Period">
          <div className="flex gap-1">
            {presets.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => onPreset(p.value)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                  preset === p.value
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                    : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="From date">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFrom(e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="To date">
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateTo(e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Sender account">
          <select
            value={senderAccountId}
            onChange={(e) => onSenderAccountId(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">All</option>
            {senderAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName ?? account.email}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Template">
          <select
            value={templateId}
            onChange={(e) => onTemplateId(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">All</option>
            {templates.map((tmpl) => (
              <option key={tmpl.id} value={tmpl.id}>
                {tmpl.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      {children}
    </div>
  );
}

function KpiTiles({ kpis }: { kpis: AnalyticsKpisResponse }) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {KPI_TILES.map((tile) => {
        const delta = kpis.deltas[tile.metric];
        return (
          <div key={tile.metric} className={CARD_CLASS}>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {tile.label}
            </p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {tile.primary(kpis.current)}
            </p>
            <div className="mt-1 flex items-center justify-between text-xs">
              {tile.secondary ? (
                <span className="text-zinc-500 dark:text-zinc-400">
                  {tile.secondary(kpis.current)}
                </span>
              ) : (
                <span />
              )}
              <span className={deltaColorClass(tile.metric, delta)}>
                {formatDelta(delta, RATE_KEYS.has(tile.metric))} vs prior
              </span>
            </div>
          </div>
        );
      })}
    </section>
  );
}

const CHART_HEIGHT = 220;
const CHART_PADDING = { top: 16, right: 16, bottom: 24, left: 40 };

function TimeSeriesChart({
  points,
}: {
  points: AnalyticsTimeseriesResponse;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 900;
  const innerWidth = width - CHART_PADDING.left - CHART_PADDING.right;
  const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  const maxValue = useMemo(() => {
    const max = Math.max(
      1,
      ...points.map((p) => Math.max(p.sent, p.opensUnique, p.clicksUnique)),
    );
    // Round up to a clean-ish ceiling so gridline labels aren't jagged.
    const magnitude = 10 ** Math.floor(Math.log10(max));
    return Math.ceil(max / magnitude) * magnitude;
  }, [points]);

  const xFor = useCallback(
    (index: number) =>
      points.length <= 1
        ? CHART_PADDING.left
        : CHART_PADDING.left + (index / (points.length - 1)) * innerWidth,
    [points.length, innerWidth],
  );
  const yFor = useCallback(
    (value: number) =>
      CHART_PADDING.top + innerHeight - (value / maxValue) * innerHeight,
    [innerHeight, maxValue],
  );

  const series: { key: "sent" | "opensUnique" | "clicksUnique"; label: string; className: string }[] =
    [
      { key: "sent", label: "Sent", className: "stroke-[#2a78d6] dark:stroke-[#3987e5]" },
      { key: "opensUnique", label: "Opens (unique)", className: "stroke-[#008300] dark:stroke-[#008300]" },
      { key: "clicksUnique", label: "Clicks (unique)", className: "stroke-[#e87ba4] dark:stroke-[#d55181]" },
    ];

  if (points.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
        No activity in this period.
      </p>
    );
  }

  const gridlineCount = 4;
  const gridlineValues = Array.from({ length: gridlineCount + 1 }, (_, i) =>
    Math.round((maxValue / gridlineCount) * i),
  );

  const tickStep = Math.max(1, Math.ceil(points.length / 8));

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = ((e.clientX - rect.left) / rect.width) * width;
    const clamped = Math.min(
      Math.max(relativeX, CHART_PADDING.left),
      width - CHART_PADDING.right,
    );
    const ratio =
      points.length <= 1 ? 0 : (clamped - CHART_PADDING.left) / innerWidth;
    const index = Math.round(ratio * (points.length - 1));
    setHoverIndex(Math.min(Math.max(index, 0), points.length - 1));
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <span className={`inline-block h-0.5 w-3 ${s.className}`} />
            {s.label}
          </div>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        className="w-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
        role="img"
        aria-label="Sent, unique opens, and unique clicks over time"
      >
        {gridlineValues.map((value) => (
          <g key={value}>
            <line
              x1={CHART_PADDING.left}
              x2={width - CHART_PADDING.right}
              y1={yFor(value)}
              y2={yFor(value)}
              className="stroke-zinc-200 dark:stroke-zinc-800"
              strokeWidth={1}
            />
            <text
              x={CHART_PADDING.left - 6}
              y={yFor(value)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-zinc-500 text-[10px] dark:fill-zinc-400"
            >
              {compactNumber(value)}
            </text>
          </g>
        ))}

        {points.map((p, i) =>
          i % tickStep === 0 ? (
            <text
              key={p.periodStart}
              x={xFor(i)}
              y={CHART_HEIGHT - 6}
              textAnchor="middle"
              className="fill-zinc-500 text-[10px] dark:fill-zinc-400"
            >
              {p.periodStart.slice(5)}
            </text>
          ) : null,
        )}

        {series.map((s) => (
          <polyline
            key={s.key}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            className={s.className}
            points={points
              .map((p, i) => `${xFor(i)},${yFor(p[s.key])}`)
              .join(" ")}
          />
        ))}

        {hoverIndex !== null && (
          <line
            x1={xFor(hoverIndex)}
            x2={xFor(hoverIndex)}
            y1={CHART_PADDING.top}
            y2={CHART_PADDING.top + innerHeight}
            strokeDasharray="3 3"
            className="stroke-zinc-400 dark:stroke-zinc-600"
            strokeWidth={1}
          />
        )}
        {hoverIndex !== null &&
          series.map((s) => (
            <circle
              key={s.key}
              cx={xFor(hoverIndex)}
              cy={yFor(points[hoverIndex][s.key])}
              r={4}
              className={`${s.className} fill-current stroke-white dark:stroke-zinc-950`}
              strokeWidth={2}
            />
          ))}
      </svg>
      {hovered && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          <span className="font-medium">{hovered.periodStart}</span>
          <span>Sent {hovered.sent}</span>
          <span>Opens {hovered.opensUnique}</span>
          <span>Clicks {hovered.clicksUnique}</span>
        </div>
      )}
    </div>
  );
}

function ComparisonPanel({
  title,
  entries,
  valueLabel,
  formatValue,
}: {
  title: string;
  entries: { id: string; label: string; sublabel: string; value: number }[];
  valueLabel: string;
  formatValue: (value: number) => string;
}) {
  const max = Math.max(0.0001, ...entries.map((e) => e.value));

  return (
    <section className={CARD_CLASS}>
      <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        {title}
      </h2>
      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No data for this period.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id}>
              <div className="mb-0.5 flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                  {entry.label}
                </span>
                <span className="shrink-0 text-zinc-500 dark:text-zinc-400">
                  {formatValue(entry.value)} {valueLabel}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                <div
                  className="h-full rounded-full bg-[#2a78d6] dark:bg-[#3987e5]"
                  style={{ width: `${(entry.value / max) * 100}%` }}
                />
              </div>
              <p className="mt-0.5 truncate text-[11px] text-zinc-400 dark:text-zinc-500">
                {entry.sublabel}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Heatmap({ points }: { points: SendTimeHeatmapResponse }) {
  const byCell = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of points) {
      map.set(`${p.weekday}-${p.hour}`, p.opens);
    }
    return map;
  }, [points]);

  const max = Math.max(1, ...points.map((p) => p.opens));

  if (points.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
        No opens recorded in this period.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[2px]">
        <thead>
          <tr>
            <th className="w-10" />
            {Array.from({ length: 24 }, (_, hour) => (
              <th
                key={hour}
                className="w-5 text-[9px] font-normal text-zinc-500 dark:text-zinc-400"
              >
                {hour % 3 === 0 ? hour : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAY_LABELS.map((label, weekday) => (
            <tr key={label}>
              <td className="pr-2 text-right text-[10px] text-zinc-500 dark:text-zinc-400">
                {label}
              </td>
              {Array.from({ length: 24 }, (_, hour) => {
                const opens = byCell.get(`${weekday}-${hour}`) ?? 0;
                const intensity = opens === 0 ? 0 : 0.15 + (opens / max) * 0.85;
                return (
                  <td key={hour}>
                    <div
                      title={`${label} ${hour}:00 UTC — ${opens} open${opens === 1 ? "" : "s"}`}
                      className="h-5 w-5 rounded-sm bg-[#2a78d6] dark:bg-[#3987e5]"
                      style={{ opacity: intensity }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
