"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  EmailTemplateSummary,
  TemplateCategorySummary,
} from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

export default function TemplateCategoriesAdminPage() {
  const { user: currentUser } = useAuth();
  const [categories, setCategories] = useState<TemplateCategorySummary[]>([]);
  const [templates, setTemplates] = useState<EmailTemplateSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [categoryList, templateList] = await Promise.all([
        apiFetch<TemplateCategorySummary[]>("/template-categories"),
        apiFetch<EmailTemplateSummary[]>("/templates"),
      ]);
      setCategories(categoryList);
      setTemplates(templateList);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load categories",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch categories on mount
    void loadData();
  }, [loadData]);

  if (currentUser && currentUser.role !== "admin") {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Only admins can manage template categories.
      </p>
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setSubmitting(true);
    try {
      await apiFetch<TemplateCategorySummary>("/template-categories", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setName("");
      await loadData();
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "Failed to add category",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function setDefaultTemplate(
    category: TemplateCategorySummary,
    defaultTemplateId: string,
  ) {
    try {
      await apiFetch(`/template-categories/${category.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          defaultTemplateId: defaultTemplateId || null,
        }),
      });
      await loadData();
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.message
          : "Failed to set default template",
      );
    }
  }

  async function removeCategory(category: TemplateCategorySummary) {
    if (!window.confirm(`Delete category "${category.name}"?`)) return;
    try {
      await apiFetch(`/template-categories/${category.id}`, {
        method: "DELETE",
      });
      await loadData();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to delete category",
      );
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Add a template category
        </h2>
        <form
          onSubmit={(event) => void handleCreate(event)}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Name
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Renewal Notice"
              className={INPUT_CLASS}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting ? "Adding…" : "Add category"}
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

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Categories
        </h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Default template</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {!loading && categories.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-4 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    No categories yet.
                  </td>
                </tr>
              )}
              {categories.map((category) => {
                const categoryTemplates = templates.filter(
                  (t) => t.categoryId === category.id,
                );
                return (
                  <tr
                    key={category.id}
                    className="text-zinc-800 dark:text-zinc-200"
                  >
                    <td className="px-3 py-2">{category.name}</td>
                    <td className="px-3 py-2">
                      <select
                        value={category.defaultTemplateId ?? ""}
                        onChange={(e) =>
                          void setDefaultTemplate(category, e.target.value)
                        }
                        className={INPUT_CLASS}
                      >
                        <option value="">None</option>
                        {categoryTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void removeCategory(category)}
                        className="text-xs font-medium text-red-600 underline hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
