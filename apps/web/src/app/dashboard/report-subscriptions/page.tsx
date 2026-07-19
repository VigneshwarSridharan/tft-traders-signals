"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  ComposeSenderAccountOption,
  CreateReportSubscriptionRequest,
  ReportSubscriptionCadence,
  ReportSubscriptionFormat,
  ReportSubscriptionKind,
  ReportSubscriptionSummary,
} from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";
import { RequireRole } from "@/components/require-role";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface FormState {
  name: string;
  kind: ReportSubscriptionKind;
  format: ReportSubscriptionFormat;
  cadence: ReportSubscriptionCadence;
  hourOfDay: number;
  dayOfWeek: number;
  dayOfMonth: number;
  recipientEmails: string;
  senderAccountId: string;
  lastDays: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  kind: "analytics_pdf",
  format: "pdf",
  cadence: "weekly",
  hourOfDay: 8,
  dayOfWeek: 1,
  dayOfMonth: 1,
  recipientEmails: "",
  senderAccountId: "",
  lastDays: "",
};

function describeSchedule(sub: ReportSubscriptionSummary): string {
  const time = `${String(sub.hourOfDay).padStart(2, "0")}:00 UTC`;
  if (sub.cadence === "daily") return `Daily at ${time}`;
  if (sub.cadence === "weekly") {
    return `Weekly on ${WEEKDAY_LABELS[sub.dayOfWeek ?? 0]} at ${time}`;
  }
  return `Monthly on day ${sub.dayOfMonth ?? 1} at ${time}`;
}

export default function ReportSubscriptionsPage() {
  return (
    <RequireRole roles={["admin", "manager"]}>
      <ReportSubscriptionsPageContent />
    </RequireRole>
  );
}

function ReportSubscriptionsPageContent() {
  const [subscriptions, setSubscriptions] = useState<
    ReportSubscriptionSummary[]
  >([]);
  const [senderAccounts, setSenderAccounts] = useState<
    ComposeSenderAccountOption[]
  >([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [runNowMessage, setRunNowMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [subs, accounts] = await Promise.all([
        apiFetch<ReportSubscriptionSummary[]>("/report-subscriptions"),
        apiFetch<ComposeSenderAccountOption[]>("/email-messages/sender-accounts"),
      ]);
      setSubscriptions(subs);
      setSenderAccounts(accounts);
      setForm((prev) =>
        prev.senderAccountId || accounts.length === 0
          ? prev
          : { ...prev, senderAccountId: accounts[0].id },
      );
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.message
          : "Failed to load report subscriptions",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch subscriptions + sender accounts on mount
    void loadData();
  }, [loadData]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setSubmitting(true);
    try {
      const recipientEmails = form.recipientEmails
        .split(/[,\n]/)
        .map((email) => email.trim())
        .filter(Boolean);
      const body: CreateReportSubscriptionRequest = {
        name: form.name,
        kind: form.kind,
        format: form.format,
        cadence: form.cadence,
        hourOfDay: form.hourOfDay,
        dayOfWeek: form.cadence === "weekly" ? form.dayOfWeek : undefined,
        dayOfMonth: form.cadence === "monthly" ? form.dayOfMonth : undefined,
        recipientEmails,
        senderAccountId: form.senderAccountId,
        filterParams: form.lastDays
          ? { lastDays: Number(form.lastDays) }
          : undefined,
      };
      await apiFetch("/report-subscriptions", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setForm((prev) => ({ ...EMPTY_FORM, senderAccountId: prev.senderAccountId }));
      await loadData();
    } catch (err) {
      setCreateError(
        err instanceof ApiError
          ? err.message
          : "Failed to create report subscription",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(sub: ReportSubscriptionSummary) {
    setBusyId(sub.id);
    try {
      await apiFetch(`/report-subscriptions/${sub.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !sub.isActive }),
      });
      await loadData();
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.message
          : "Failed to update report subscription",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function runNow(sub: ReportSubscriptionSummary) {
    setBusyId(sub.id);
    setRunNowMessage(null);
    try {
      await apiFetch(`/report-subscriptions/${sub.id}/run-now`, {
        method: "POST",
      });
      setRunNowMessage(
        `Queued "${sub.name}" to run now — refresh in a moment to see the result.`,
      );
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to queue the run",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function deleteSubscription(sub: ReportSubscriptionSummary) {
    if (
      !window.confirm(
        `Delete the report subscription "${sub.name}"? This can't be undone.`,
      )
    ) {
      return;
    }
    setBusyId(sub.id);
    try {
      await apiFetch(`/report-subscriptions/${sub.id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.message
          : "Failed to delete report subscription",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          New report subscription
        </h2>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          Re-generates a report on a cadence and emails it as an attachment
          from the chosen sender account.
        </p>
        <form
          onSubmit={(event) => void handleCreate(event)}
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Weekly ops digest"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Sender account">
              <select
                required
                value={form.senderAccountId}
                onChange={(e) =>
                  setForm({ ...form, senderAccountId: e.target.value })
                }
                className={INPUT_CLASS}
              >
                <option value="" disabled>
                  Select a sender account
                </option>
                {senderAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName ?? account.email}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Report">
              <select
                value={form.kind}
                onChange={(e) => {
                  const kind = e.target.value as ReportSubscriptionKind;
                  setForm({
                    ...form,
                    kind,
                    format: kind === "analytics_pdf" ? "pdf" : "csv",
                  });
                }}
                className={INPUT_CLASS}
              >
                <option value="analytics_pdf">Analytics summary (PDF)</option>
                <option value="sent_mail">Sent-mail export</option>
              </select>
            </Field>
            {form.kind === "sent_mail" && (
              <Field label="Format">
                <select
                  value={form.format}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      format: e.target.value as ReportSubscriptionFormat,
                    })
                  }
                  className={INPUT_CLASS}
                >
                  <option value="csv">CSV</option>
                  <option value="xlsx">Excel</option>
                </select>
              </Field>
            )}
            <Field label="Cadence">
              <select
                value={form.cadence}
                onChange={(e) =>
                  setForm({
                    ...form,
                    cadence: e.target.value as ReportSubscriptionCadence,
                  })
                }
                className={INPUT_CLASS}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </Field>
            <Field label="Hour of day (UTC)">
              <input
                required
                type="number"
                min={0}
                max={23}
                value={form.hourOfDay}
                onChange={(e) =>
                  setForm({ ...form, hourOfDay: Number(e.target.value) })
                }
                className={INPUT_CLASS}
              />
            </Field>
            {form.cadence === "weekly" && (
              <Field label="Day of week">
                <select
                  value={form.dayOfWeek}
                  onChange={(e) =>
                    setForm({ ...form, dayOfWeek: Number(e.target.value) })
                  }
                  className={INPUT_CLASS}
                >
                  {WEEKDAY_LABELS.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {form.cadence === "monthly" && (
              <Field label="Day of month (1–28)">
                <input
                  required
                  type="number"
                  min={1}
                  max={28}
                  value={form.dayOfMonth}
                  onChange={(e) =>
                    setForm({ ...form, dayOfMonth: Number(e.target.value) })
                  }
                  className={INPUT_CLASS}
                />
              </Field>
            )}
            <Field label="Lookback window (days, optional)">
              <input
                type="number"
                min={1}
                max={366}
                value={form.lastDays}
                onChange={(e) =>
                  setForm({ ...form, lastDays: e.target.value })
                }
                placeholder="Defaults by cadence"
                className={INPUT_CLASS}
              />
            </Field>
          </div>
          <Field label="Recipients (comma or newline separated)">
            <textarea
              required
              rows={2}
              value={form.recipientEmails}
              onChange={(e) =>
                setForm({ ...form, recipientEmails: e.target.value })
              }
              placeholder="ops@example.com, lead@example.com"
              className={INPUT_CLASS}
            />
          </Field>
          <button
            type="submit"
            disabled={submitting || !form.senderAccountId}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting ? "Creating…" : "Create subscription"}
          </button>
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
      {runNowMessage && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          {runNowMessage}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Subscriptions
        </h2>
        {!loading && subscriptions.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No report subscriptions yet.
          </p>
        )}
        <div className="space-y-3">
          {subscriptions.map((sub) => (
            <div
              key={sub.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {sub.name}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {sub.kind === "analytics_pdf"
                      ? "Analytics summary (PDF)"
                      : `Sent-mail export (${sub.format.toUpperCase()})`}
                    {" · "}
                    {describeSchedule(sub)}
                    {" · from "}
                    {sub.senderAccountEmail}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    To: {sub.recipientEmails.join(", ")}
                  </p>
                </div>
                {sub.isActive ? (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    Active
                  </span>
                ) : (
                  <span className="text-xs font-medium text-red-600 dark:text-red-400">
                    Inactive
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Next run: {new Date(sub.nextRunAt).toLocaleString()}
                {sub.lastRunAt &&
                  ` · Last run: ${new Date(sub.lastRunAt).toLocaleString()}`}
              </p>
              {sub.lastRunError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  Last run failed: {sub.lastRunError}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <button
                  type="button"
                  disabled={busyId === sub.id}
                  onClick={() => void toggleActive(sub)}
                  className="font-medium text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  {sub.isActive ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  disabled={busyId === sub.id}
                  onClick={() => void runNow(sub)}
                  className="font-medium text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Run now
                </button>
                <button
                  type="button"
                  disabled={busyId === sub.id}
                  onClick={() => void deleteSubscription(sub)}
                  className="font-medium text-red-600 underline hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
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
