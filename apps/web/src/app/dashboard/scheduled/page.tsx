"use client";

import { useCallback, useEffect, useState } from "react";
import type { ScheduledSendListItem, ScheduledSendListResponse } from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function isInPast(date: Date): boolean {
  return Number.isNaN(date.getTime()) || date.getTime() <= Date.now();
}

export default function ScheduledSendsPage() {
  const [result, setResult] = useState<ScheduledSendListResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch<ScheduledSendListResponse>(
        "/scheduled-sends",
      );
      setResult(data);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load scheduled sends",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch scheduled sends on mount
    void load();
  }, [load]);

  function startEdit(item: ScheduledSendListItem) {
    setActionError(null);
    setEditingId(item.messageId);
    setEditValue(toDatetimeLocal(item.scheduledFor));
  }

  async function handleReschedule(messageId: string) {
    setActionError(null);
    const parsed = new Date(editValue);
    if (isInPast(parsed)) {
      setActionError("Scheduled time must be in the future");
      return;
    }
    setBusyId(messageId);
    try {
      await apiFetch(`/scheduled-sends/${messageId}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ scheduledFor: parsed.toISOString() }),
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to reschedule",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function cancelSend(messageId: string) {
    setActionError(null);
    setBusyId(messageId);
    try {
      await apiFetch(`/scheduled-sends/${messageId}/cancel`, {
        method: "POST",
      });
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to cancel",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Scheduled
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Messages queued to send at a future time. Edit or cancel before
          dispatch.
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
                <th className="px-3 py-2 font-medium">Scheduled for</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {!loading && (result?.items.length ?? 0) === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-4 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    Nothing scheduled.
                  </td>
                </tr>
              )}
              {result?.items.map((item) => (
                <tr
                  key={item.messageId}
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
                  <td className="px-3 py-2">
                    {editingId === item.messageId ? (
                      <input
                        type="datetime-local"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className={INPUT_CLASS}
                      />
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
                    {editingId === item.messageId ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busyId === item.messageId}
                          onClick={() => void handleReschedule(item.messageId)}
                          className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-xs font-medium text-zinc-600 underline dark:text-zinc-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.messageId}
                          onClick={() => void cancelSend(item.messageId)}
                          className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          Cancel
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
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            {result.total} scheduled message{result.total === 1 ? "" : "s"}
          </p>
        )}
      </section>
    </div>
  );
}
