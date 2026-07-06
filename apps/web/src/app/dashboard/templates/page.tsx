"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  CreateTemplateRequest,
  CustomerListResponse,
  CustomerSummary,
  EmailTemplateSummary,
  MergeFieldOption,
  TemplateCategorySummary,
  TemplatePreviewResponse,
  TemplateStatus,
  TemplateVersionSummary,
  TestSendTemplateResponse,
} from "@tft/shared";
import { TEMPLATE_STATUSES } from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/rich-text-editor";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

const EMPTY_FORM = {
  categoryId: "",
  name: "",
  subject: "",
  bodyHtml: "<p></p>",
};

export default function TemplatesPage() {
  const [categories, setCategories] = useState<TemplateCategorySummary[]>([]);
  const [mergeFields, setMergeFields] = useState<MergeFieldOption[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [templates, setTemplates] = useState<EmailTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | "">("");
  const [search, setSearch] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateTemplateRequest>(EMPTY_FORM);
  const [customPlainText, setCustomPlainText] = useState(false);
  const [bodyText, setBodyText] = useState("");
  const [htmlSourceView, setHtmlSourceView] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formWarning, setFormWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const editorRef = useRef<RichTextEditorHandle>(null);

  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const [versions, setVersions] = useState<TemplateVersionSummary[]>([]);

  const [previewCustomerId, setPreviewCustomerId] = useState("");
  const [preview, setPreview] = useState<TemplatePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [testSendTarget, setTestSendTarget] =
    useState<EmailTemplateSummary | null>(null);
  const [testSendEmail, setTestSendEmail] = useState("");
  const [testSendResult, setTestSendResult] =
    useState<TestSendTemplateResponse | null>(null);
  const [testSendError, setTestSendError] = useState<string | null>(null);

  const loadReferenceData = useCallback(async () => {
    const [categoryList, mergeFieldList, customerList] = await Promise.all([
      apiFetch<TemplateCategorySummary[]>("/template-categories"),
      apiFetch<MergeFieldOption[]>("/templates/merge-fields"),
      apiFetch<CustomerListResponse>(
        "/customers?pageSize=100&sort=name&sortDir=asc",
      ),
    ]);
    setCategories(categoryList);
    setMergeFields(mergeFieldList);
    setCustomers(customerList.items);
  }, []);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set("categoryId", categoryFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      const list = await apiFetch<EmailTemplateSummary[]>(
        `/templates?${params.toString()}`,
      );
      setTemplates(list);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load templates",
      );
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, statusFilter, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch reference data on mount
    void loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch templates when filters change
    void loadTemplates();
  }, [loadTemplates]);

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setBodyText("");
    setCustomPlainText(false);
    setHtmlSourceView(false);
    setFormError(null);
    setFormWarning(null);
    setPreview(null);
  }

  function startEdit(template: EmailTemplateSummary) {
    setEditingId(template.id);
    setForm({
      categoryId: template.categoryId,
      name: template.name,
      subject: template.currentVersion?.subject ?? "",
      bodyHtml: template.currentVersion?.bodyHtml ?? "<p></p>",
    });
    setBodyText(template.currentVersion?.bodyText ?? "");
    setCustomPlainText(Boolean(template.currentVersion?.bodyText));
    setHtmlSourceView(false);
    setFormError(null);
    setFormWarning(null);
    setPreview(null);
    setVersionsFor(null);
  }

  function insertMergeField(key: string, target: "subject" | "body") {
    const token = `{{${key}}}`;
    if (target === "subject") {
      setForm((prev) => ({ ...prev, subject: prev.subject + token }));
    } else {
      editorRef.current?.insertText(token);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFormWarning(null);
    setSubmitting(true);
    try {
      const payload = {
        subject: form.subject,
        bodyHtml: form.bodyHtml,
        bodyText: customPlainText ? bodyText : undefined,
      };

      let saved: EmailTemplateSummary;
      if (editingId) {
        await apiFetch(`/templates/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name,
            categoryId: form.categoryId,
          }),
        });
        saved = await apiFetch<EmailTemplateSummary>(
          `/templates/${editingId}/versions`,
          { method: "POST", body: JSON.stringify(payload) },
        );
      } else {
        saved = await apiFetch<EmailTemplateSummary>("/templates", {
          method: "POST",
          body: JSON.stringify({
            categoryId: form.categoryId,
            name: form.name,
            ...payload,
          }),
        });
      }

      const unknown = saved.currentVersion?.unknownPlaceholders ?? [];
      if (unknown.length > 0) {
        setFormWarning(`Unknown merge fields: ${unknown.join(", ")}`);
      }
      resetForm();
      await loadTemplates();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Failed to save template",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function duplicateTemplate(template: EmailTemplateSummary) {
    try {
      await apiFetch(`/templates/${template.id}/duplicate`, {
        method: "POST",
      });
      await loadTemplates();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to duplicate template",
      );
    }
  }

  async function changeStatus(
    template: EmailTemplateSummary,
    status: TemplateStatus,
  ) {
    try {
      await apiFetch(`/templates/${template.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadTemplates();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to change status",
      );
    }
  }

  async function deleteTemplate(template: EmailTemplateSummary) {
    if (!window.confirm(`Delete template "${template.name}"?`)) return;
    try {
      await apiFetch(`/templates/${template.id}`, { method: "DELETE" });
      if (editingId === template.id) resetForm();
      await loadTemplates();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to delete template",
      );
    }
  }

  async function toggleVersions(template: EmailTemplateSummary) {
    if (versionsFor === template.id) {
      setVersionsFor(null);
      return;
    }
    try {
      const list = await apiFetch<TemplateVersionSummary[]>(
        `/templates/${template.id}/versions`,
      );
      setVersions(list.sort((a, b) => b.versionNo - a.versionNo));
      setVersionsFor(template.id);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load versions",
      );
    }
  }

  async function runPreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await apiFetch<TemplatePreviewResponse>(
        "/templates/preview",
        {
          method: "POST",
          body: JSON.stringify({
            subject: form.subject,
            bodyHtml: form.bodyHtml,
            bodyText: customPlainText ? bodyText : undefined,
            customerId: previewCustomerId || undefined,
          }),
        },
      );
      setPreview(result);
    } catch (err) {
      setPreviewError(
        err instanceof ApiError ? err.message : "Failed to render preview",
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  async function sendTestSend() {
    if (!testSendTarget) return;
    setTestSendError(null);
    setTestSendResult(null);
    try {
      const result = await apiFetch<TestSendTemplateResponse>(
        `/templates/${testSendTarget.id}/test-send`,
        { method: "POST", body: JSON.stringify({ to: testSendEmail }) },
      );
      setTestSendResult(result);
    } catch (err) {
      setTestSendError(
        err instanceof ApiError ? err.message : "Failed to test-send",
      );
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {editingId ? "Edit template" : "New template"}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-medium text-zinc-600 underline dark:text-zinc-400"
            >
              Start a new template instead
            </button>
          )}
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Category">
              <select
                required
                value={form.categoryId}
                onChange={(e) =>
                  setForm({ ...form, categoryId: e.target.value })
                }
                className={INPUT_CLASS}
              >
                <option value="" disabled>
                  Select a category
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Name">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={INPUT_CLASS}
              />
            </Field>
          </div>

          <Field label="Subject">
            <div className="flex gap-2">
              <input
                required
                value={form.subject}
                onChange={(e) =>
                  setForm({ ...form, subject: e.target.value })
                }
                className={INPUT_CLASS}
              />
              <MergeFieldPicker
                fields={mergeFields}
                onInsert={(key) => insertMergeField(key, "subject")}
              />
            </div>
          </Field>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Body
              </label>
              <div className="flex items-center gap-2">
                <MergeFieldPicker
                  fields={mergeFields}
                  onInsert={(key) => insertMergeField(key, "body")}
                />
                <button
                  type="button"
                  onClick={() => setHtmlSourceView((v) => !v)}
                  className="text-xs font-medium text-zinc-600 underline dark:text-zinc-400"
                >
                  {htmlSourceView ? "Rich editor" : "HTML source"}
                </button>
              </div>
            </div>
            {htmlSourceView ? (
              <textarea
                value={form.bodyHtml}
                onChange={(e) =>
                  setForm({ ...form, bodyHtml: e.target.value })
                }
                rows={10}
                className={`${INPUT_CLASS} font-mono text-xs`}
              />
            ) : (
              <RichTextEditor
                ref={editorRef}
                value={form.bodyHtml}
                onChange={(html) => setForm({ ...form, bodyHtml: html })}
              />
            )}
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={customPlainText}
                onChange={(e) => setCustomPlainText(e.target.checked)}
              />
              Override plain-text body (otherwise auto-generated from HTML)
            </label>
            {customPlainText && (
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={4}
                className={INPUT_CLASS}
              />
            )}
          </div>

          {formWarning && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {formWarning}
            </p>
          )}
          {formError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {submitting
                ? "Saving…"
                : editingId
                  ? "Save new version"
                  : "Create template"}
            </button>
            <div className="flex items-center gap-2">
              <select
                value={previewCustomerId}
                onChange={(e) => setPreviewCustomerId(e.target.value)}
                className={`${INPUT_CLASS} w-56`}
              >
                <option value="">Sample data</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void runPreview()}
                disabled={previewLoading}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                {previewLoading ? "Rendering…" : "Preview"}
              </button>
            </div>
          </div>
        </form>

        {previewError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {previewError}
          </p>
        )}
        {preview && (
          <div className="mt-4 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Subject
            </p>
            <p className="mb-3 text-sm text-zinc-900 dark:text-zinc-50">
              {preview.subject}
            </p>
            <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Body
            </p>
            <div
              className="rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
              dangerouslySetInnerHTML={{ __html: preview.bodyHtml }}
            />
            {preview.unresolvedPlaceholders.length > 0 && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                Unresolved: {preview.unresolvedPlaceholders.join(", ")}
              </p>
            )}
          </div>
        )}
      </section>

      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field label="Category">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">All</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as TemplateStatus | "")
              }
              className={INPUT_CLASS}
            >
              <option value="">All</option>
              {TEMPLATE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Search">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Template name"
              className={INPUT_CLASS}
            />
          </Field>
        </div>

        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {!loading && templates.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-4 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    No templates found.
                  </td>
                </tr>
              )}
              {templates.map((template) => (
                <Fragment key={template.id}>
                  <tr
                    key={template.id}
                    className="align-top text-zinc-800 dark:text-zinc-200"
                  >
                    <td className="px-3 py-2">{template.name}</td>
                    <td className="px-3 py-2">{template.categoryName}</td>
                    <td className="px-3 py-2">
                      <select
                        value={template.status}
                        onChange={(e) =>
                          void changeStatus(
                            template,
                            e.target.value as TemplateStatus,
                          )
                        }
                        className="rounded-md border border-zinc-300 bg-transparent px-1 py-0.5 text-xs dark:border-zinc-700"
                      >
                        {TEMPLATE_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      v{template.currentVersion?.versionNo ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => startEdit(template)}
                          className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void duplicateTemplate(template)}
                          className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleVersions(template)}
                          className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                        >
                          History
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTestSendTarget(template);
                            setTestSendEmail("");
                            setTestSendResult(null);
                            setTestSendError(null);
                          }}
                          className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                        >
                          Test-send
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteTemplate(template)}
                          className="text-xs font-medium text-red-600 underline hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {versionsFor === template.id && (
                    <tr key={`${template.id}-versions`}>
                      <td
                        colSpan={5}
                        className="bg-zinc-50 px-3 py-3 dark:bg-zinc-900"
                      >
                        <p className="mb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                          Version history
                        </p>
                        <ul className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
                          {versions.map((version) => (
                            <li key={version.id}>
                              v{version.versionNo} — {version.subject} (
                              {new Date(version.createdAt).toLocaleString()})
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                  {testSendTarget?.id === template.id && (
                    <tr key={`${template.id}-test-send`}>
                      <td
                        colSpan={5}
                        className="bg-zinc-50 px-3 py-3 dark:bg-zinc-900"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="email"
                            required
                            placeholder="you@example.com"
                            value={testSendEmail}
                            onChange={(e) => setTestSendEmail(e.target.value)}
                            className={`${INPUT_CLASS} w-64`}
                          />
                          <button
                            type="button"
                            onClick={() => void sendTestSend()}
                            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            Send test
                          </button>
                          <button
                            type="button"
                            onClick={() => setTestSendTarget(null)}
                            className="text-xs font-medium text-zinc-600 underline dark:text-zinc-400"
                          >
                            Close
                          </button>
                        </div>
                        {testSendResult && (
                          <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                            Accepted for {testSendResult.to} (stub — real
                            sending lands in a later task).
                          </p>
                        )}
                        {testSendError && (
                          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                            {testSendError}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
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

function MergeFieldPicker({
  fields,
  onInsert,
}: {
  fields: MergeFieldOption[];
  onInsert: (key: string) => void;
}) {
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onInsert(e.target.value);
      }}
      className="rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-xs dark:border-zinc-700"
    >
      <option value="">+ merge field</option>
      {["customer", "sender", "other"].map((group) => (
        <optgroup key={group} label={group}>
          {fields
            .filter((field) => field.group === group)
            .map((field) => (
              <option key={field.key} value={field.key}>
                {field.label}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}
