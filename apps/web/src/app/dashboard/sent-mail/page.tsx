"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MESSAGE_STATUSES,
  type ComposeSenderAccountOption,
  type EmailMessageListQuery,
  type EmailMessageListResponse,
  type EmailTemplateSummary,
  type MessageListSortField,
  type MessageStatus,
  type SavedMessageFilter,
  type TagSummary,
} from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

const PAGE_SIZE = 25;

const SORT_OPTIONS: { value: MessageListSortField; label: string }[] = [
  { value: "sentAt", label: "Sent at" },
  { value: "createdAt", label: "Created at" },
  { value: "openCount", label: "Opens" },
  { value: "clickCount", label: "Clicks" },
  { value: "status", label: "Status" },
];

const STATUS_STYLES: Record<MessageStatus, string> = {
  draft: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  queued: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  sending: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  sent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  delivered:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  bounced: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  cancelled: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function SentMailPage() {
  const [result, setResult] = useState<EmailMessageListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [senderAccounts, setSenderAccounts] = useState<
    ComposeSenderAccountOption[]
  >([]);
  const [templates, setTemplates] = useState<EmailTemplateSummary[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [savedFilters, setSavedFilters] = useState<SavedMessageFilter[]>([]);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MessageStatus | "">("");
  const [senderAccountId, setSenderAccountId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [tagId, setTagId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<MessageListSortField>("sentAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const [saveFilterName, setSaveFilterName] = useState("");
  const [savingFilter, setSavingFilter] = useState(false);

  const loadReferenceData = useCallback(async () => {
    const [accounts, templateList, tagList, filters] = await Promise.all([
      apiFetch<ComposeSenderAccountOption[]>("/email-messages/sender-accounts"),
      apiFetch<EmailTemplateSummary[]>("/templates"),
      apiFetch<TagSummary[]>("/tags"),
      apiFetch<SavedMessageFilter[]>("/email-messages/saved-filters"),
    ]);
    setSenderAccounts(accounts);
    setTemplates(templateList);
    setTags(tagList);
    setSavedFilters(filters);
  }, []);

  const currentFilter: EmailMessageListQuery = useMemo(
    () => ({
      search: search || undefined,
      status: status || undefined,
      senderAccountId: senderAccountId || undefined,
      templateId: templateId || undefined,
      tagId: tagId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sort,
      sortDir,
    }),
    [search, status, senderAccountId, templateId, tagId, dateFrom, dateTo, sort, sortDir],
  );

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (currentFilter.search) params.set("search", currentFilter.search);
      if (currentFilter.status) params.set("status", currentFilter.status);
      if (currentFilter.senderAccountId)
        params.set("senderAccountId", currentFilter.senderAccountId);
      if (currentFilter.templateId)
        params.set("templateId", currentFilter.templateId);
      if (currentFilter.tagId) params.set("tagId", currentFilter.tagId);
      if (currentFilter.dateFrom) params.set("dateFrom", currentFilter.dateFrom);
      if (currentFilter.dateTo) params.set("dateTo", currentFilter.dateTo);
      params.set("sort", sort);
      params.set("sortDir", sortDir);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));

      const data = await apiFetch<EmailMessageListResponse>(
        `/email-messages?${params.toString()}`,
      );
      setResult(data);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load sent mail",
      );
    } finally {
      setLoading(false);
    }
  }, [currentFilter, sort, sortDir, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch reference data on mount
    void loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch messages when filters change
    void loadMessages();
  }, [loadMessages]);

  const totalPages = useMemo(() => {
    if (!result || result.pageSize === 0) return 1;
    return Math.max(1, Math.ceil(result.total / result.pageSize));
  }, [result]);

  function applyFilter(filter: EmailMessageListQuery) {
    setPage(1);
    setSearch(filter.search ?? "");
    setStatus(filter.status ?? "");
    setSenderAccountId(filter.senderAccountId ?? "");
    setTemplateId(filter.templateId ?? "");
    setTagId(filter.tagId ?? "");
    setDateFrom(filter.dateFrom ?? "");
    setDateTo(filter.dateTo ?? "");
    setSort(filter.sort ?? "sentAt");
    setSortDir(filter.sortDir ?? "desc");
  }

  function resetFilters() {
    applyFilter({});
  }

  async function saveCurrentFilter() {
    if (!saveFilterName.trim()) return;
    setSavingFilter(true);
    try {
      const created = await apiFetch<SavedMessageFilter>(
        "/email-messages/saved-filters",
        {
          method: "POST",
          body: JSON.stringify({
            name: saveFilterName.trim(),
            filter: currentFilter,
          }),
        },
      );
      setSavedFilters((prev) => [...prev, created]);
      setSaveFilterName("");
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to save filter",
      );
    } finally {
      setSavingFilter(false);
    }
  }

  async function deleteSavedFilter(id: string) {
    await apiFetch(`/email-messages/saved-filters/${id}`, {
      method: "DELETE",
    });
    setSavedFilters((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Sent Mail
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Search and filter every email sent through the platform.
        </p>
      </div>

      {savedFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Saved filters:
          </span>
          {savedFilters.map((filter) => (
            <span
              key={filter.id}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              <button
                type="button"
                onClick={() => applyFilter(filter.filter)}
                className="hover:underline"
              >
                {filter.name}
              </button>
              <button
                type="button"
                onClick={() => void deleteSavedFilter(filter.id)}
                className="text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                aria-label={`Delete saved filter ${filter.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      )}

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search">
            <input
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Recipient or subject"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as MessageStatus | "");
              }}
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
              onChange={(e) => {
                setPage(1);
                setSenderAccountId(e.target.value);
              }}
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
              onChange={(e) => {
                setPage(1);
                setTemplateId(e.target.value);
              }}
              className={INPUT_CLASS}
            >
              <option value="">All</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tag">
            <select
              value={tagId}
              onChange={(e) => {
                setPage(1);
                setTagId(e.target.value);
              }}
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
              onChange={(e) => {
                setPage(1);
                setDateFrom(e.target.value);
              }}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="To date">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setPage(1);
                setDateTo(e.target.value);
              }}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Sort by">
            <div className="flex gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as MessageListSortField)}
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Clear filters
          </button>
          <input
            value={saveFilterName}
            onChange={(e) => setSaveFilterName(e.target.value)}
            placeholder="Save current filter as…"
            className={`${INPUT_CLASS} max-w-[200px]`}
          />
          <button
            type="button"
            disabled={savingFilter || !saveFilterName.trim()}
            onClick={() => void saveCurrentFilter()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {savingFilter ? "Saving…" : "Save filter"}
          </button>
        </div>
      </section>

      <section>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Recipient</th>
                <th className="px-3 py-2 font-medium">Sender account</th>
                <th className="px-3 py-2 font-medium">Subject</th>
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
                  className="align-top text-zinc-800 dark:text-zinc-200"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/sent-mail/${item.id}`}
                      className="font-medium text-zinc-900 underline hover:no-underline dark:text-zinc-50"
                    >
                      {item.toName ?? item.toEmail}
                    </Link>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {item.toEmail}
                    </div>
                    {item.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-block rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {item.senderAccountDisplayName ?? item.senderAccountEmail}
                  </td>
                  <td className="px-3 py-2">{item.subject ?? "—"}</td>
                  <td className="px-3 py-2">{item.templateName ?? "Ad hoc"}</td>
                  <td className="px-3 py-2">{formatDate(item.sentAt)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[item.status]}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{item.openCount}</td>
                  <td className="px-3 py-2">{item.clickCount}</td>
                  <td className="px-3 py-2">{item.repliedAt ? "Yes" : "No"}</td>
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
