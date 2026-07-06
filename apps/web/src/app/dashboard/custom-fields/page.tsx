"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  CreateCustomFieldDefRequest,
  CustomFieldDefSummary,
  CustomFieldType,
} from "@tft/shared";
import { CUSTOM_FIELD_TYPES } from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

const EMPTY_FORM: CreateCustomFieldDefRequest = {
  key: "",
  label: "",
  fieldType: "text",
};

export default function CustomFieldsAdminPage() {
  const { user: currentUser } = useAuth();
  const [defs, setDefs] = useState<CustomFieldDefSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<CreateCustomFieldDefRequest>(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await apiFetch<CustomFieldDefSummary[]>(
        "/custom-field-defs",
      );
      setDefs(list);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load custom fields",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch custom fields on mount
    void loadData();
  }, [loadData]);

  if (currentUser && currentUser.role !== "admin") {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Only admins can manage custom fields.
      </p>
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setSubmitting(true);
    try {
      await apiFetch<CustomFieldDefSummary>("/custom-field-defs", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm(EMPTY_FORM);
      await loadData();
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "Failed to add custom field",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function removeDef(def: CustomFieldDefSummary) {
    if (!window.confirm(`Delete custom field "${def.label}"?`)) return;
    try {
      await apiFetch(`/custom-field-defs/${def.id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to delete custom field",
      );
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Add a custom field
        </h2>
        <form
          onSubmit={(event) => void handleCreate(event)}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Field label="Key (merge field name)">
            <input
              required
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
              placeholder="gst_number"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Label">
            <input
              required
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="GST Number"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Type">
            <select
              value={form.fieldType}
              onChange={(e) =>
                setForm({
                  ...form,
                  fieldType: e.target.value as CustomFieldType,
                })
              }
              className={INPUT_CLASS}
            >
              {CUSTOM_FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {submitting ? "Adding…" : "Add field"}
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
          Custom fields
        </h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Key</th>
                <th className="px-3 py-2 font-medium">Label</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {!loading && defs.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-4 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    No custom fields yet.
                  </td>
                </tr>
              )}
              {defs.map((def) => (
                <tr key={def.id} className="text-zinc-800 dark:text-zinc-200">
                  <td className="px-3 py-2 font-mono text-xs">{def.key}</td>
                  <td className="px-3 py-2">{def.label}</td>
                  <td className="px-3 py-2">{def.fieldType}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void removeDef(def)}
                      className="text-xs font-medium text-red-600 underline hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
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
