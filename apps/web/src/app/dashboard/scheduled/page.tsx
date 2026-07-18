"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScheduledSendListResponse } from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";
import { RequireRole } from "@/components/require-role";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

const PAGE_SIZE = 25;

function toDateInputValue(iso: string): string {
  const date = new Date(iso);
  return date.toISOString().slice(0, 10);
}

function toTimeInputValue(iso: string): string {
  const date = new Date(iso);
  return date.toTimeString().slice(0, 5);
}

export default function ScheduledSendsPage() {
  return (
    <RequireRole roles={["admin", "manager", "agent"]}>
      <ScheduledSendsPageContent />
    </RequireRole>
  );
}

function ScheduledSendsPageContent() {
  const [result, setResult] = useState<ScheduledSendListResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);

  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduling, setRescheduling] = useState(false);

  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      const data = await apiFetch<ScheduledSendListResponse>(
        `/scheduled-sends?${params.toString()}`,
      );
      setResult(data);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load scheduled sends",
      );
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch scheduled sends when the page changes
    void loadItems();
  }, [loadItems]);

  const totalPages = useMemo(() => {
    if (!result || result.pageSize === 0) return 1;
    return Math.max(1, Math.ceil(result.total / result.pageSize));
  }, [result]);

  function startReschedule(messageId: string, scheduledFor: string) {
    setActionError(null);
    setReschedulingId(messageId);
    setRescheduleDate(toDateInputValue(scheduledFor));
    setRescheduleTime(toTimeInputValue(scheduledFor));
  }

  async function submitReschedule(messageId: string) {
    if (!rescheduleDate || !rescheduleTime) {
      setActionError("Pick a date and time");
      return;
    }
    const scheduledFor = new Date(`${rescheduleDate}T${rescheduleTime}`);
    if (Number.isNaN(scheduledFor.getTime()) || scheduledFor <= new Date()) {
      setActionError("Scheduled time must be in the future");
      return;
    }

    setRescheduling(true);
    setActionError(null);
    try {
      await apiFetch(`/scheduled-sends/${messageId}`, {
        method: "PATCH",
        body: JSON.stringify({
          scheduledFor: scheduledFor.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      setReschedulingId(null);
      await loadItems();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to reschedule",
      );
    } finally {
      setRescheduling(false);
    }
  }

  async function cancelSend(messageId: string) {
    if (!window.confirm("Cancel this scheduled send? This can't be undone.")) {
      return;
    }
    setCancellingId(messageId);
    setActionError(null);
    try {
      await apiFetch(`/scheduled-sends/${messageId}`, { method: "DELETE" });
      await loadItems();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to cancel",
      );
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Scheduled Sends
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Messages queued to send later. Edit or cancel them before dispatch.
        </p>
      </div>

      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      )}
      {actionError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {actionError}
        </p>
      )}

      <section>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Recipient</th>
                <th className="px-3 py-2 font-medium">Subject</th>
                <th className="px-3 py-2 font-medium">Sender</th>
                <th className="px-3 py-2 font-medium">Template</th>
                <th className="px-3 py-2 font-medium">Scheduled for</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {!loading && (result?.items.length ?? 0) === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-4 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    Nothing scheduled.
                  </td>
                </tr>
              )}
              {result?.items.map((item) => (
                <tr
                  key={item.id}
                  className="align-top text-zinc-800 dark:text-zinc-200"
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
                    {reschedulingId === item.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="date"
                          value={rescheduleDate}
                          onChange={(e) => setRescheduleDate(e.target.value)}
                          className={`${INPUT_CLASS} w-36`}
                        />
                        <input
                          type="time"
                          value={rescheduleTime}
                          onChange={(e) => setRescheduleTime(e.target.value)}
                          className={`${INPUT_CLASS} w-28`}
                        />
                      </div>
                    ) : (
                      <>
                        {new Date(item.scheduledFor).toLocaleString()}
                        {item.timezone && (
                          <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
                            ({item.timezone})
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {reschedulingId === item.id ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void submitReschedule(item.id)}
                          disabled={rescheduling}
                          className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
                        >
                          {rescheduling ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setReschedulingId(null)}
                          className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            startReschedule(item.id, item.scheduledFor)
                          }
                          className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                        >
                          Reschedule
                        </button>
                        <button
                          type="button"
                          onClick={() => void cancelSend(item.id)}
                          disabled={cancellingId === item.id}
                          className="text-xs font-medium text-red-600 underline hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                        >
                          {cancellingId === item.id ? "Cancelling…" : "Cancel"}
                        </button>
                      </div>
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
              {result.total} scheduled · page {page} of {totalPages}
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
