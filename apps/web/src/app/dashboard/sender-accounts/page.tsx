"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  CreateSenderAccountRequest,
  SenderAccountSummary,
  VerifySenderAccountResponse,
} from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

const EMPTY_FORM: CreateSenderAccountRequest = {
  email: "",
  appPassword: "",
  displayName: "",
  smtpHost: "smtp.zoho.com",
  smtpPort: 465,
  imapHost: "imap.zoho.com",
  imapPort: 993,
};

export default function SenderAccountsAdminPage() {
  const { user: currentUser } = useAuth();
  const [accounts, setAccounts] = useState<SenderAccountSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<CreateSenderAccountRequest>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [verifyResults, setVerifyResults] = useState<
    Record<string, VerifySenderAccountResponse>
  >({});
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await apiFetch<SenderAccountSummary[]>("/sender-accounts");
      setAccounts(list);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load sender accounts",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (currentUser && currentUser.role !== "admin") {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Only admins can manage sender accounts.
      </p>
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setSubmitting(true);
    try {
      await apiFetch<SenderAccountSummary>("/sender-accounts", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          displayName: form.displayName ? form.displayName : undefined,
        }),
      });
      setForm(EMPTY_FORM);
      await loadData();
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "Failed to add sender account",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyAccount(id: string) {
    setVerifyingId(id);
    try {
      const result = await apiFetch<VerifySenderAccountResponse>(
        `/sender-accounts/${id}/verify`,
        { method: "POST" },
      );
      setVerifyResults((prev) => ({ ...prev, [id]: result }));
      await loadData();
    } catch (err) {
      setVerifyResults((prev) => ({
        ...prev,
        [id]: {
          status: "auth_failed",
          smtpOk: false,
          imapOk: false,
          message: err instanceof ApiError ? err.message : "Verification failed",
          lastVerifiedAt: null,
        },
      }));
    } finally {
      setVerifyingId(null);
    }
  }

  async function toggleStatus(account: SenderAccountSummary) {
    await apiFetch(`/sender-accounts/${account.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: account.status === "disabled" ? "active" : "disabled",
      }),
    });
    await loadData();
  }

  async function removeAccount(account: SenderAccountSummary) {
    try {
      await apiFetch(`/sender-accounts/${account.id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to delete sender account",
      );
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Add a sender account
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
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Display name">
            <input
              value={form.displayName ?? ""}
              onChange={(e) =>
                setForm({ ...form, displayName: e.target.value })
              }
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="App password">
            <input
              required
              type="password"
              value={form.appPassword}
              onChange={(e) =>
                setForm({ ...form, appPassword: e.target.value })
              }
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="SMTP host">
            <input
              value={form.smtpHost}
              onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="SMTP port">
            <input
              type="number"
              value={form.smtpPort}
              onChange={(e) =>
                setForm({ ...form, smtpPort: Number(e.target.value) })
              }
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="IMAP host">
            <input
              value={form.imapHost}
              onChange={(e) => setForm({ ...form, imapHost: e.target.value })}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="IMAP port">
            <input
              type="number"
              value={form.imapPort}
              onChange={(e) =>
                setForm({ ...form, imapPort: Number(e.target.value) })
              }
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Daily quota">
            <input
              type="number"
              value={form.dailyQuota ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  dailyQuota: e.target.value ? Number(e.target.value) : null,
                })
              }
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Hourly quota">
            <input
              type="number"
              value={form.hourlyQuota ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  hourlyQuota: e.target.value ? Number(e.target.value) : null,
                })
              }
              className={INPUT_CLASS}
            />
          </Field>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {submitting ? "Adding…" : "Add account"}
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
          Sender accounts
        </h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Quota (daily / hourly)</th>
                <th className="px-3 py-2 font-medium">Last verified</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {!loading && accounts.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-4 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    No sender accounts yet.
                  </td>
                </tr>
              )}
              {accounts.map((account) => (
                <tr key={account.id} className="text-zinc-800 dark:text-zinc-200">
                  <td className="px-3 py-2">
                    <div>{account.email}</div>
                    {account.displayName && (
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {account.displayName}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={account.status} />
                    {verifyResults[account.id] && (
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {verifyResults[account.id].message}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {account.dailyUsed}/{account.dailyQuota ?? "∞"} ·{" "}
                    {account.hourlyUsed}/{account.hourlyQuota ?? "∞"}
                  </td>
                  <td className="px-3 py-2">
                    {account.lastVerifiedAt
                      ? new Date(account.lastVerifiedAt).toLocaleString()
                      : "Never"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        disabled={verifyingId === account.id}
                        onClick={() => void verifyAccount(account.id)}
                        className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-50"
                      >
                        {verifyingId === account.id
                          ? "Verifying…"
                          : "Verify connection"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleStatus(account)}
                        className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                      >
                        {account.status === "disabled" ? "Enable" : "Disable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeAccount(account)}
                        className="text-xs font-medium text-red-600 underline hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
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

function StatusBadge({ status }: { status: SenderAccountSummary["status"] }) {
  const styles: Record<SenderAccountSummary["status"], string> = {
    active:
      "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    disabled: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    auth_failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };
  const labels: Record<SenderAccountSummary["status"], string> = {
    active: "Active",
    disabled: "Disabled",
    auth_failed: "Auth failed",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
