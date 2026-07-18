"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AUDIT_LOG_ACTIONS,
  type AuditLogListResponse,
  type UserSummary,
} from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";
import { RequireRole } from "@/components/require-role";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

const PAGE_SIZE = 25;

export default function AuditLogPage() {
  return (
    <RequireRole roles={["admin"]}>
      <AuditLogPageContent />
    </RequireRole>
  );
}

function AuditLogPageContent() {
  const [result, setResult] = useState<AuditLogListResponse | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const loadUsers = useCallback(async () => {
    const userList = await apiFetch<UserSummary[]>("/users");
    setUsers(userList);
  }, []);

  const loadAuditLog = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (userId) params.set("userId", userId);
      if (action) params.set("action", action);
      if (entityType) params.set("entityType", entityType);
      if (entityId) params.set("entityId", entityId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));

      const data = await apiFetch<AuditLogListResponse>(
        `/audit-logs?${params.toString()}`,
      );
      setResult(data);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load audit log",
      );
    } finally {
      setLoading(false);
    }
  }, [userId, action, entityType, entityId, dateFrom, dateTo, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch filter reference data on mount
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch audit log when filters change
    void loadAuditLog();
  }, [loadAuditLog]);

  const totalPages =
    result && result.pageSize > 0
      ? Math.max(1, Math.ceil(result.total / result.pageSize))
      : 1;

  function resetToFirstPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setPage(1);
      setter(value);
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Audit Log
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Append-only record of logins, sends, template/credential changes,
          suppression overrides, exports, and role changes.
        </p>
      </div>

      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      )}

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="User">
            <select
              value={userId}
              onChange={(e) => resetToFirstPage(setUserId)(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">All</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.email})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Action">
            <select
              value={action}
              onChange={(e) => resetToFirstPage(setAction)(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">All</option>
              {AUDIT_LOG_ACTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Entity type">
            <input
              value={entityType}
              onChange={(e) =>
                resetToFirstPage(setEntityType)(e.target.value)
              }
              placeholder="e.g. template"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Entity ID">
            <input
              value={entityId}
              onChange={(e) => resetToFirstPage(setEntityId)(e.target.value)}
              className={INPUT_CLASS}
            />
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
        </div>
      </section>

      <section>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Entity</th>
                <th className="px-3 py-2 font-medium">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {!loading && (result?.items.length ?? 0) === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-4 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    No audit events found.
                  </td>
                </tr>
              )}
              {result?.items.map((item) => (
                <tr
                  key={item.id}
                  className="align-top text-zinc-800 dark:text-zinc-200"
                >
                  <td className="whitespace-nowrap px-3 py-2">
                    {new Date(item.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    {item.userName ? (
                      <div>
                        <div className="font-medium">{item.userName}</div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          {item.userEmail}
                        </div>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {item.action}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {item.entityType ? (
                      <div>
                        <div>{item.entityType}</div>
                        <div className="text-zinc-500 dark:text-zinc-400">
                          {item.entityId}
                        </div>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-md truncate px-3 py-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {Object.keys(item.metadata).length > 0
                      ? JSON.stringify(item.metadata)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {result && (
          <div className="mt-3 flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
            <span>
              {result.total} event{result.total === 1 ? "" : "s"} · page{" "}
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
