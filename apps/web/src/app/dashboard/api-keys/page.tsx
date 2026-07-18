"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  ApiKeyScope,
  ApiKeySummary,
  CreateApiKeyResponse,
} from "@tft/shared";
import { API_KEY_SCOPES } from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

const EMPTY_FORM = {
  name: "",
  scopes: [] as ApiKeyScope[],
  expiresAt: "",
};

export default function ApiKeysPage() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await apiFetch<ApiKeySummary[]>("/api-keys");
      setKeys(list);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load API keys",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch keys on mount
    void loadData();
  }, [loadData]);

  function toggleScope(scope: ApiKeyScope) {
    setForm((prev) => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope],
    }));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch<CreateApiKeyResponse>("/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          scopes: form.scopes,
          expiresAt: form.expiresAt
            ? new Date(form.expiresAt).toISOString()
            : undefined,
        }),
      });
      setRevealedSecret(result.secret);
      setCopied(false);
      setForm(EMPTY_FORM);
      await loadData();
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "Failed to create API key",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(key: ApiKeySummary) {
    if (
      !window.confirm(
        `Revoke the key "${key.name}"? Any script using it will immediately stop working.`,
      )
    ) {
      return;
    }
    setRevokingId(key.id);
    try {
      await apiFetch(`/api-keys/${key.id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to revoke key",
      );
    } finally {
      setRevokingId(null);
    }
  }

  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Create an API key
          </h2>
          <a
            href="/v1/docs"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            View API documentation
          </a>
        </div>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          API keys let scripts call the public REST API (
          <code>/v1/...</code>, served on the API host — see the docs link
          above) with a Bearer token instead of a dashboard login. Pick only
          the scopes a script needs.
        </p>
        <form
          onSubmit={(event) => void handleCreate(event)}
          className="space-y-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="CI deploy script"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Expires (optional)">
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) =>
                  setForm({ ...form, expiresAt: e.target.value })
                }
                className={INPUT_CLASS}
              />
            </Field>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Scopes
            </span>
            <div className="flex flex-wrap gap-3">
              {API_KEY_SCOPES.map((scope) => (
                <label
                  key={scope}
                  className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300"
                >
                  <input
                    type="checkbox"
                    checked={form.scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                  />
                  {scope}
                </label>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting || form.scopes.length === 0}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting ? "Creating…" : "Create key"}
          </button>
        </form>
        {createError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {createError}
          </p>
        )}
      </section>

      {revealedSecret && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <h2 className="mb-1 text-sm font-semibold text-amber-900 dark:text-amber-100">
            Your new API key
          </h2>
          <p className="mb-2 text-xs text-amber-800 dark:text-amber-200">
            Copy it now — for your security, it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md border border-amber-300 bg-white px-2 py-1.5 text-xs text-zinc-900 dark:border-amber-800 dark:bg-zinc-950 dark:text-zinc-50">
              {revealedSecret}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(revealedSecret);
                setCopied(true);
              }}
              className="rounded-md border border-amber-400 px-2 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-900"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setRevealedSecret(null)}
            className="mt-2 text-xs font-medium text-amber-800 underline hover:text-amber-950 dark:text-amber-200"
          >
            Dismiss
          </button>
        </section>
      )}

      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {isAdmin ? "All API keys" : "Your API keys"}
        </h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                {isAdmin && <th className="px-3 py-2 font-medium">Owner</th>}
                <th className="px-3 py-2 font-medium">Scopes</th>
                <th className="px-3 py-2 font-medium">Last used</th>
                <th className="px-3 py-2 font-medium">Expires</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {!loading && keys.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 7 : 6}
                    className="px-3 py-4 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    No API keys yet.
                  </td>
                </tr>
              )}
              {keys.map((key) => (
                <tr key={key.id} className="text-zinc-800 dark:text-zinc-200">
                  <td className="px-3 py-2">{key.name}</td>
                  {isAdmin && (
                    <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {key.userName ?? key.userId}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {key.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {key.lastUsedAt
                      ? new Date(key.lastUsedAt).toLocaleString()
                      : "Never"}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {key.expiresAt
                      ? new Date(key.expiresAt).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="px-3 py-2">
                    {key.revokedAt ? (
                      <span className="text-xs font-medium text-red-600 dark:text-red-400">
                        Revoked
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!key.revokedAt && (
                      <button
                        type="button"
                        disabled={revokingId === key.id}
                        onClick={() => void revoke(key)}
                        className="text-xs font-medium text-red-600 underline hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Revoke
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
