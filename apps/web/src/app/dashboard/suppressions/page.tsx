"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CreateSuppressionRequest, SuppressionSummary } from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

const REASON_LABELS: Record<SuppressionSummary["reason"], string> = {
  hard_bounce: "Hard bounce",
  soft_bounce_repeat: "Repeated soft bounce",
  unsubscribe: "Unsubscribed",
  manual: "Manual",
  spam_report: "Spam report",
};

const EMPTY_FORM: CreateSuppressionRequest = { email: "" };

export default function SuppressionsPage() {
  const { user: currentUser } = useAuth();
  const [suppressions, setSuppressions] = useState<SuppressionSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<CreateSuppressionRequest>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [releasingId, setReleasingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await apiFetch<SuppressionSummary[]>("/suppressions");
      setSuppressions(list);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load suppressions",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch suppressions on mount
    void loadData();
  }, [loadData]);

  if (currentUser && currentUser.role !== "admin") {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Only admins can manage suppressions.
      </p>
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setSubmitting(true);
    try {
      await apiFetch<SuppressionSummary>("/suppressions", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm(EMPTY_FORM);
      await loadData();
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "Failed to add suppression",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function release(entry: SuppressionSummary) {
    if (
      !window.confirm(
        `Release the suppression for "${entry.email}"? Future sends to this address will no longer be blocked.`,
      )
    ) {
      return;
    }
    setReleasingId(entry.id);
    try {
      await apiFetch(`/suppressions/${entry.id}/release`, { method: "POST" });
      await loadData();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to release suppression",
      );
    } finally {
      setReleasingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Manually suppress an address
        </h2>
        <form
          onSubmit={(event) => void handleCreate(event)}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Field label="Email">
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="jane@acme.com"
              className={INPUT_CLASS}
            />
          </Field>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {submitting ? "Adding…" : "Suppress"}
            </button>
          </div>
        </form>
        {createError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {createError}
          </p>
        )}
      </section>

      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Suppressed addresses
        </h2>
        <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
          Suppressed customers are blocked from future sends until released.
          Hard bounces suppress immediately; repeated soft bounces suppress
          after 3 within 30 days.
        </p>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Suppressed at</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {!loading && suppressions.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-4 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    No suppressed addresses.
                  </td>
                </tr>
              )}
              {suppressions.map((entry) => (
                <tr key={entry.id} className="text-zinc-800 dark:text-zinc-200">
                  <td className="px-3 py-2 font-mono text-xs">{entry.email}</td>
                  <td className="px-3 py-2">{REASON_LABELS[entry.reason]}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(entry.suppressedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    {entry.releasedAt ? (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        Released {new Date(entry.releasedAt).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-red-600 dark:text-red-400">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!entry.releasedAt && (
                      <button
                        type="button"
                        disabled={releasingId === entry.id}
                        onClick={() => void release(entry)}
                        className="text-xs font-medium text-red-600 underline hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Release
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      {children}
    </div>
  );
}
