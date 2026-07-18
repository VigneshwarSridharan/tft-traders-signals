"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MESSAGE_STATUSES,
  type ComposeSenderAccountOption,
  type EmailTemplateSummary,
  type MessageStatus,
  type RealtimeTrackingEvent,
  type SentMailListResponse,
  type SentMailSortField,
  type TagSummary,
} from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useRealtimeEvents } from "@/lib/realtime-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

const PAGE_SIZE = 25;

const SORT_OPTIONS: { value: SentMailSortField; label: string }[] = [
  { value: "sentAt", label: "Sent at" },
  { value: "createdAt", label: "Date created" },
  { value: "toEmail", label: "Recipient" },
  { value: "subject", label: "Subject" },
  { value: "status", label: "Status" },
];

export default function SentMailPage() {
  const router = useRouter();
  const [result, setResult] = useState<SentMailListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [senderAccounts, setSenderAccounts] = useState<
    ComposeSenderAccountOption[]
  >([]);
  const [templates, setTemplates] = useState<EmailTemplateSummary[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MessageStatus | "">("");
  const [senderAccountId, setSenderAccountId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [tagId, setTagId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<SentMailSortField>("sentAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const loadReferenceData = useCallback(async () => {
    const [senderAccountList, templateList, tagList] = await Promise.all([
      apiFetch<ComposeSenderAccountOption[]>("/email-messages/sender-accounts"),
      apiFetch<EmailTemplateSummary[]>("/templates"),
      apiFetch<TagSummary[]>("/tags"),
    ]);
    setSenderAccounts(senderAccountList);
    setTemplates(templateList);
    setTags(tagList);
  }, []);

  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (senderAccountId) params.set("senderAccountId", senderAccountId);
    if (templateId) params.set("templateId", templateId);
    if (tagId) params.set("tagId", tagId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    params.set("sort", sort);
    params.set("sortDir", sortDir);
    return params;
  }, [search, status, senderAccountId, templateId, tagId, dateFrom, dateTo, sort, sortDir]);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = buildFilterParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));

      const data = await apiFetch<SentMailListResponse>(
        `/sent-mail?${params.toString()}`,
      );
      setResult(data);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load sent mail",
      );
    } finally {
      setLoading(false);
    }
  }, [buildFilterParams, page]);

  const exportUrl = useCallback(
    (format: "csv" | "xlsx") => {
      const params = buildFilterParams();
      params.set("format", format);
      return `${API_URL}/reports/sent-mail/export?${params.toString()}`;
    },
    [buildFilterParams],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch filter reference data on mount
    void loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch sent mail when filters change
    void loadMessages();
  }, [loadMessages]);

  const handleRealtimeEvent = useCallback((event: RealtimeTrackingEvent) => {
    setResult((prev) => {
      if (!prev) return prev;
      let changed = false;
      const items = prev.items.map((item) => {
        if (item.id !== event.messageId) return item;
        changed = true;
        return {
          ...item,
          status: event.status,
          openCount: event.openCount,
          clickCount: event.clickCount,
          repliedAt: event.repliedAt,
        };
      });
      return changed ? { ...prev, items } : prev;
    });
  }, []);

  useRealtimeEvents(handleRealtimeEvent);

  const totalPages = useMemo(() => {
    if (!result || result.pageSize === 0) return 1;
    return Math.max(1, Math.ceil(result.total / result.pageSize));
  }, [result]);

  function resetToFirstPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setPage(1);
      setter(value);
    };
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Sent Mail
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Every message sent through the platform, with opens, clicks, and
            bounces.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={exportUrl("csv")}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Export CSV
          </a>
          <a
            href={exportUrl("xlsx")}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Export Excel
          </a>
        </div>
      </div>

      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      )}

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search">
            <input
              value={search}
              onChange={(e) => resetToFirstPage(setSearch)(e.target.value)}
              placeholder="Recipient or subject"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) =>
                resetToFirstPage(setStatus)(e.target.value as MessageStatus | "")
              }
              className={INPUT_CLASS}
            >
              <option value="">All</option>
              {MESSAGE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sender account">
            <select
              value={senderAccountId}
              onChange={(e) =>
                resetToFirstPage(setSenderAccountId)(e.target.value)
              }
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
              onChange={(e) => resetToFirstPage(setTemplateId)(e.target.value)}
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
          <Field label="Tag">
            <select
              value={tagId}
              onChange={(e) => resetToFirstPage(setTagId)(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">All</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From date">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => resetToFirstPage(setDateFrom)(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="To date">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => resetToFirstPage(setDateTo)(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Sort by">
            <div className="flex gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SentMailSortField)}
                className={INPUT_CLASS}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
                className={INPUT_CLASS}
              >
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
            </div>
          </Field>
        </div>
      </section>

      <section>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Recipient</th>
                <th className="px-3 py-2 font-medium">Subject</th>
                <th className="px-3 py-2 font-medium">Sender</th>
                <th className="px-3 py-2 font-medium">Template</th>
                <th className="px-3 py-2 font-medium">Sent at</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Opens</th>
                <th className="px-3 py-2 font-medium">Clicks</th>
                <th className="px-3 py-2 font-medium">Replied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {!loading && (result?.items.length ?? 0) === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-4 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    No sent mail found.
                  </td>
                </tr>
              )}
              {result?.items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => router.push(`/dashboard/sent-mail/${item.id}`)}
                  className="cursor-pointer align-top text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{item.toName ?? "—"}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {item.toEmail}
                    </div>
                  </td>
                  <td className="max-w-xs truncate px-3 py-2">
                    {item.subject ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {item.senderAccountDisplayName ?? item.senderAccountEmail}
                  </td>
                  <td className="px-3 py-2">{item.templateName ?? "Ad hoc"}</td>
                  <td className="px-3 py-2">
                    {item.sentAt
                      ? new Date(item.sentAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-3 py-2">{item.openCount}</td>
                  <td className="px-3 py-2">{item.clickCount}</td>
                  <td className="px-3 py-2">
                    {item.repliedAt ? (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        Yes
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {result && (
          <div className="mt-3 flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
            <span>
              {result.total} message{result.total === 1 ? "" : "s"} · page{" "}
              {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-zinc-700"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-zinc-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
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

const STATUS_STYLES: Record<MessageStatus, string> = {
  draft: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  queued: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  scheduled:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  sending: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  delivered:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  bounced: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  cancelled: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function StatusBadge({ status }: { status: MessageStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
