"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import type {
  CreateCustomerRequest,
  CsvImportResult,
  CustomerListResponse,
  CustomerSortField,
  CustomerSummary,
  CustomFieldDefSummary,
  TagSummary,
  UpdateCustomerRequest,
} from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

const PAGE_SIZE = 25;

const SORT_OPTIONS: { value: CustomerSortField; label: string }[] = [
  { value: "createdAt", label: "Date added" },
  { value: "name", label: "Name" },
  { value: "company", label: "Company" },
  { value: "email", label: "Email" },
  { value: "engagementScore", label: "Engagement" },
];

const EMPTY_FORM: CreateCustomerRequest = {
  name: "",
  email: "",
  company: "",
  phone: "",
  notes: "",
  trackingOptOut: false,
};

export default function CustomersPage() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "manager";
  const [result, setResult] = useState<CustomerListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tags, setTags] = useState<TagSummary[]>([]);
  const [fieldDefs, setFieldDefs] = useState<CustomFieldDefSummary[]>([]);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CustomerSortField>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [tagFilter, setTagFilter] = useState("");
  const [page, setPage] = useState(1);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateCustomerRequest>(EMPTY_FORM);
  const [customFieldValues, setCustomFieldValues] = useState<
    Record<string, string>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [importResult, setImportResult] = useState<CsvImportResult | null>(
    null,
  );
  const [importing, setImporting] = useState(false);

  const loadReferenceData = useCallback(async () => {
    const [tagList, fieldDefList] = await Promise.all([
      apiFetch<TagSummary[]>("/tags"),
      apiFetch<CustomFieldDefSummary[]>("/custom-field-defs"),
    ]);
    setTags(tagList);
    setFieldDefs(fieldDefList);
  }, []);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("sort", sort);
      params.set("sortDir", sortDir);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (tagFilter) params.set("tagId", tagFilter);

      const data = await apiFetch<CustomerListResponse>(
        `/customers?${params.toString()}`,
      );
      setResult(data);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load customers",
      );
    } finally {
      setLoading(false);
    }
  }, [search, sort, sortDir, tagFilter, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch tags/custom fields on mount
    void loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch customers when filters change
    void loadCustomers();
  }, [loadCustomers]);

  const totalPages = useMemo(() => {
    if (!result || result.pageSize === 0) return 1;
    return Math.max(1, Math.ceil(result.total / result.pageSize));
  }, [result]);

  function startEdit(customer: CustomerSummary) {
    setEditingId(customer.id);
    setForm({
      name: customer.name,
      email: customer.email,
      company: customer.company ?? "",
      phone: customer.phone ?? "",
      notes: customer.notes ?? "",
      trackingOptOut: customer.trackingOptOut,
    });
    setCustomFieldValues(
      Object.fromEntries(
        fieldDefs.map((def) => [def.key, customer.customFields[def.key] ?? ""]),
      ),
    );
    setFormError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCustomFieldValues({});
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const customFields = Object.fromEntries(
        Object.entries(customFieldValues).filter(([, v]) => v !== ""),
      );

      if (editingId) {
        const patch: UpdateCustomerRequest = {
          name: form.name,
          company: form.company || null,
          phone: form.phone || null,
          notes: form.notes || null,
          trackingOptOut: form.trackingOptOut,
          ...(Object.keys(customFields).length > 0 ? { customFields } : {}),
        };
        await apiFetch(`/customers/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
      } else {
        await apiFetch<CustomerSummary>("/customers", {
          method: "POST",
          body: JSON.stringify({
            ...form,
            company: form.company || undefined,
            phone: form.phone || undefined,
            notes: form.notes || undefined,
            ...(Object.keys(customFields).length > 0 ? { customFields } : {}),
          }),
        });
      }
      cancelEdit();
      await loadCustomers();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Failed to save customer",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function removeCustomer(customer: CustomerSummary) {
    if (!window.confirm(`Delete ${customer.name}?`)) return;
    try {
      await apiFetch(`/customers/${customer.id}`, { method: "DELETE" });
      await loadCustomers();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to delete customer",
      );
    }
  }

  async function addTagToCustomer(customer: CustomerSummary, tagId: string) {
    if (!tagId) return;
    await apiFetch(`/customers/${customer.id}/tags`, {
      method: "POST",
      body: JSON.stringify({ tagId }),
    });
    await loadCustomers();
  }

  async function removeTagFromCustomer(customer: CustomerSummary, tagId: string) {
    await apiFetch(`/customers/${customer.id}/tags/${tagId}`, {
      method: "DELETE",
    });
    await loadCustomers();
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setImportResult(null);
    try {
      const csv = await file.text();
      const outcome = await apiFetch<CsvImportResult>("/customers/import", {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      setImportResult(outcome);
      await loadCustomers();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to import CSV",
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-8">
      {canManage && (
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {editingId ? "Edit customer" : "Add a customer"}
        </h2>
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Field label="Name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Email">
            <input
              required
              type="email"
              disabled={Boolean(editingId)}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={`${INPUT_CLASS} disabled:opacity-60`}
            />
          </Field>
          <Field label="Company">
            <input
              value={form.company ?? ""}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Phone">
            <input
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Notes">
            <input
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={INPUT_CLASS}
            />
          </Field>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={form.trackingOptOut ?? false}
                onChange={(e) =>
                  setForm({ ...form, trackingOptOut: e.target.checked })
                }
              />
              Tracking opt-out
            </label>
          </div>
          {fieldDefs.map((def) => (
            <Field key={def.id} label={def.label}>
              <input
                value={customFieldValues[def.key] ?? ""}
                onChange={(e) =>
                  setCustomFieldValues({
                    ...customFieldValues,
                    [def.key]: e.target.value,
                  })
                }
                className={INPUT_CLASS}
              />
            </Field>
          ))}
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {submitting
                ? "Saving…"
                : editingId
                  ? "Save changes"
                  : "Add customer"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
        {formError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {formError}
          </p>
        )}
      </section>
      )}

      {canManage && (
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Import / export
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900">
            {importing ? "Importing…" : "Import CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleImportFile(file);
              }}
            />
          </label>
          <a
            href={`${API_URL}/customers/export`}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Export CSV
          </a>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            CSV columns: name, email, company, phone, notes, tracking_opt_out
            {fieldDefs.length > 0 &&
              `, ${fieldDefs.map((d) => d.key).join(", ")}`}
          </span>
        </div>
        {importResult && (
          <div className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
            <p>
              Imported {importResult.imported}, skipped {importResult.skipped}.
            </p>
            {importResult.errors.length > 0 && (
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs text-red-600 dark:text-red-400">
                {importResult.errors.map((error, index) => (
                  <li key={index}>
                    Row {error.row} ({error.email ?? "no email"}):{" "}
                    {error.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      )}

      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field label="Search">
            <input
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Name, company, or email"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Sort by">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as CustomerSortField)}
              className={INPUT_CLASS}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Direction">
            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
              className={INPUT_CLASS}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </Field>
          <Field label="Tag">
            <select
              value={tagFilter}
              onChange={(e) => {
                setPage(1);
                setTagFilter(e.target.value);
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
        </div>

        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Tags</th>
                <th className="px-3 py-2 font-medium">Flags</th>
                <th className="px-3 py-2 font-medium">Engagement</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {!loading && (result?.items.length ?? 0) === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-4 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    No customers found.
                  </td>
                </tr>
              )}
              {result?.items.map((customer) => {
                const assignedTagIds = new Set(customer.tags.map((t) => t.id));
                const availableTags = tags.filter(
                  (tag) => !assignedTagIds.has(tag.id),
                );
                return (
                  <tr key={customer.id} className="align-top text-zinc-800 dark:text-zinc-200">
                    <td className="px-3 py-2">
                      <Link
                        href={`/dashboard/customers/${customer.id}`}
                        className="underline hover:text-zinc-950 dark:hover:text-white"
                      >
                        {customer.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{customer.email}</td>
                    <td className="px-3 py-2">{customer.company ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {customer.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          >
                            {tag.name}
                            {canManage && (
                            <button
                              type="button"
                              onClick={() =>
                                void removeTagFromCustomer(customer, tag.id)
                              }
                              className="text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                              aria-label={`Remove tag ${tag.name}`}
                            >
                              ×
                            </button>
                            )}
                          </span>
                        ))}
                        {canManage && availableTags.length > 0 && (
                          <select
                            value=""
                            onChange={(e) =>
                              void addTagToCustomer(customer, e.target.value)
                            }
                            className="rounded-md border border-zinc-300 bg-transparent px-1 py-0.5 text-xs dark:border-zinc-700"
                          >
                            <option value="">+ tag</option>
                            {availableTags.map((tag) => (
                              <option key={tag.id} value={tag.id}>
                                {tag.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {customer.trackingOptOut && (
                          <FlagBadge label="No tracking" />
                        )}
                        {customer.unsubscribed && (
                          <FlagBadge label="Unsubscribed" tone="red" />
                        )}
                        {customer.suppressed && !customer.unsubscribed && (
                          <FlagBadge label="Suppressed" tone="red" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">{customer.engagementScore}</td>
                    <td className="px-3 py-2 text-right">
                      {canManage && (
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => startEdit(customer)}
                          className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeCustomer(customer)}
                          className="text-xs font-medium text-red-600 underline hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {result && (
          <div className="mt-3 flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
            <span>
              {result.total} customer{result.total === 1 ? "" : "s"} · page{" "}
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

function FlagBadge({
  label,
  tone = "zinc",
}: {
  label: string;
  tone?: "zinc" | "red";
}) {
  const styles =
    tone === "red"
      ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
      : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>
      {label}
    </span>
  );
}
