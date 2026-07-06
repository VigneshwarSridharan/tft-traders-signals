"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ComposeSenderAccountOption,
  ComposeSendRequest,
  ComposeSendResponse,
  ComposeTestSendResponse,
  CustomerListResponse,
  CustomerSummary,
  EmailTemplateSummary,
  MergeFieldOption,
  TemplateCategorySummary,
  TemplatePreviewResponse,
} from "@tft/shared";
import { useAuth } from "@/lib/auth-context";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/rich-text-editor";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

const BLANK_TEMPLATE_VALUE = "";
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const DRAFT_STORAGE_KEY = "tft-compose-draft-v1";

interface TemplateSnapshot {
  versionId: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
}

interface ComposeDraft {
  senderAccountId: string;
  categoryId: string;
  templateId: string;
  selectedCustomers: CustomerSummary[];
  subject: string;
  bodyHtml: string;
  customPlainText: boolean;
  bodyText: string;
  trackingEnabled: boolean;
  overrideSuppression: boolean;
  fallbackValues: Record<string, string>;
}

const EMPTY_DRAFT: ComposeDraft = {
  senderAccountId: "",
  categoryId: "",
  templateId: BLANK_TEMPLATE_VALUE,
  selectedCustomers: [],
  subject: "",
  bodyHtml: "<p></p>",
  customPlainText: false,
  bodyText: "",
  trackingEnabled: true,
  overrideSuppression: false,
  fallbackValues: {},
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ComposePage() {
  const { user } = useAuth();

  const [senderAccounts, setSenderAccounts] = useState<
    ComposeSenderAccountOption[]
  >([]);
  const [categories, setCategories] = useState<TemplateCategorySummary[]>([]);
  const [templates, setTemplates] = useState<EmailTemplateSummary[]>([]);
  const [mergeFields, setMergeFields] = useState<MergeFieldOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [senderAccountId, setSenderAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [templateId, setTemplateId] = useState(BLANK_TEMPLATE_VALUE);
  const [templateSnapshot, setTemplateSnapshot] =
    useState<TemplateSnapshot | null>(null);

  const [selectedCustomers, setSelectedCustomers] = useState<
    Map<string, CustomerSummary>
  >(new Map());
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerSummary[]>(
    [],
  );

  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p></p>");
  const [customPlainText, setCustomPlainText] = useState(false);
  const [bodyText, setBodyText] = useState("");
  const [htmlSourceView, setHtmlSourceView] = useState(false);
  const editorRef = useRef<RichTextEditorHandle>(null);

  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [overrideSuppression, setOverrideSuppression] = useState(false);
  const [fallbackValues, setFallbackValues] = useState<Record<string, string>>(
    {},
  );

  const [attachments, setAttachments] = useState<File[]>([]);

  const [previewCustomerId, setPreviewCustomerId] = useState("");
  const [preview, setPreview] = useState<TemplatePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [testSendLoading, setTestSendLoading] = useState(false);
  const [testSendResult, setTestSendResult] =
    useState<ComposeTestSendResponse | null>(null);
  const [testSendError, setTestSendError] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<ComposeSendResponse | null>(
    null,
  );
  const [sendError, setSendError] = useState<string | null>(null);

  const loadReferenceData = useCallback(async () => {
    try {
      const [accounts, categoryList, templateList, mergeFieldList] =
        await Promise.all([
          apiFetch<ComposeSenderAccountOption[]>(
            "/email-messages/sender-accounts",
          ),
          apiFetch<TemplateCategorySummary[]>("/template-categories"),
          apiFetch<EmailTemplateSummary[]>("/templates?status=active"),
          apiFetch<MergeFieldOption[]>("/templates/merge-fields"),
        ]);
      setSenderAccounts(accounts);
      setCategories(categoryList);
      setTemplates(templateList);
      setMergeFields(mergeFieldList);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load compose data",
      );
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch reference data on mount
    void loadReferenceData();
  }, [loadReferenceData]);

  // Restore the draft once, after mount, so we don't clobber it with defaults.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time draft restore on mount */
    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as ComposeDraft;
        setSenderAccountId(draft.senderAccountId);
        setCategoryId(draft.categoryId);
        setTemplateId(draft.templateId);
        setSelectedCustomers(
          new Map(draft.selectedCustomers.map((c) => [c.id, c])),
        );
        setSubject(draft.subject);
        setBodyHtml(draft.bodyHtml);
        setCustomPlainText(draft.customPlainText);
        setBodyText(draft.bodyText);
        setTrackingEnabled(draft.trackingEnabled);
        setOverrideSuppression(draft.overrideSuppression);
        setFallbackValues(draft.fallbackValues);
      }
    } catch {
      // Ignore a corrupted draft.
    } finally {
      setHydrated(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Restore template snapshot linkage once templates have loaded.
  useEffect(() => {
    if (!hydrated || !templateId || templates.length === 0) return;
    const template = templates.find((t) => t.id === templateId);
    if (template?.currentVersion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resync snapshot with restored draft
      setTemplateSnapshot({
        versionId: template.currentVersion.id,
        subject: template.currentVersion.subject,
        bodyHtml: template.currentVersion.bodyHtml,
        bodyText: template.currentVersion.bodyText,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once templates arrive
  }, [hydrated, templates]);

  useEffect(() => {
    if (!hydrated) return;
    const draft: ComposeDraft = {
      senderAccountId,
      categoryId,
      templateId,
      selectedCustomers: [...selectedCustomers.values()],
      subject,
      bodyHtml,
      customPlainText,
      bodyText,
      trackingEnabled,
      overrideSuppression,
      fallbackValues,
    };
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [
    hydrated,
    senderAccountId,
    categoryId,
    templateId,
    selectedCustomers,
    subject,
    bodyHtml,
    customPlainText,
    bodyText,
    trackingEnabled,
    overrideSuppression,
    fallbackValues,
  ]);

  useEffect(() => {
    const handle = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ pageSize: "20" });
        if (customerSearch) params.set("search", customerSearch);
        const result = await apiFetch<CustomerListResponse>(
          `/customers?${params.toString()}`,
        );
        setCustomerResults(result.items);
      } catch {
        setCustomerResults([]);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [customerSearch]);

  function addCustomer(customer: CustomerSummary) {
    setSelectedCustomers((prev) => {
      const next = new Map(prev);
      next.set(customer.id, customer);
      return next;
    });
  }

  function removeCustomer(id: string) {
    setSelectedCustomers((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    if (previewCustomerId === id) setPreviewCustomerId("");
  }

  const templatesInCategory = useMemo(
    () =>
      categoryId
        ? templates.filter((t) => t.categoryId === categoryId)
        : templates,
    [templates, categoryId],
  );

  const templatesByCategory = useMemo(() => {
    const groups = new Map<string, EmailTemplateSummary[]>();
    for (const template of templatesInCategory) {
      const list = groups.get(template.categoryName) ?? [];
      list.push(template);
      groups.set(template.categoryName, list);
    }
    return groups;
  }, [templatesInCategory]);

  function applyTemplateSelection(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    setPreview(null);
    if (!nextTemplateId) {
      setTemplateSnapshot(null);
      return;
    }
    const template = templates.find((t) => t.id === nextTemplateId);
    if (!template?.currentVersion) return;
    setSubject(template.currentVersion.subject);
    setBodyHtml(template.currentVersion.bodyHtml);
    setBodyText(template.currentVersion.bodyText ?? "");
    setCustomPlainText(Boolean(template.currentVersion.bodyText));
    setHtmlSourceView(false);
    setTemplateSnapshot({
      versionId: template.currentVersion.id,
      subject: template.currentVersion.subject,
      bodyHtml: template.currentVersion.bodyHtml,
      bodyText: template.currentVersion.bodyText,
    });
  }

  function handleCategoryChange(nextCategoryId: string) {
    setCategoryId(nextCategoryId);
    const category = categories.find((c) => c.id === nextCategoryId);
    if (category?.defaultTemplateId) {
      const inCategory = templates.find(
        (t) => t.id === category.defaultTemplateId,
      );
      if (inCategory) {
        applyTemplateSelection(inCategory.id);
        return;
      }
    }
    applyTemplateSelection(BLANK_TEMPLATE_VALUE);
  }

  function insertMergeField(key: string, target: "subject" | "body") {
    const token = `{{${key}}}`;
    if (target === "subject") {
      setSubject((prev) => prev + token);
    } else {
      editorRef.current?.insertText(token);
    }
  }

  const isDirty = useMemo(() => {
    if (!templateSnapshot) return false;
    if (subject !== templateSnapshot.subject) return true;
    if (bodyHtml !== templateSnapshot.bodyHtml) return true;
    if (customPlainText && bodyText !== (templateSnapshot.bodyText ?? ""))
      return true;
    return false;
  }, [templateSnapshot, subject, bodyHtml, customPlainText, bodyText]);

  const effectiveTemplateVersionId =
    templateSnapshot && !isDirty ? templateSnapshot.versionId : undefined;

  const selectedSenderAccount = senderAccounts.find(
    (a) => a.id === senderAccountId,
  );

  const suppressedCount = [...selectedCustomers.values()].filter(
    (c) => c.suppressed || c.unsubscribed,
  ).length;

  const totalAttachmentBytes = attachments.reduce((sum, f) => sum + f.size, 0);

  const unresolvedKeys = useMemo(() => {
    const keys = new Set(Object.keys(fallbackValues));
    for (const key of preview?.unresolvedPlaceholders ?? []) keys.add(key);
    // customer.*/sender.* fields are always auto-filled at send time; anything
    // else (e.g. quotation.number) has no other source and needs a fallback.
    const text = `${subject} ${bodyHtml} ${customPlainText ? bodyText : ""}`;
    for (const match of text.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) {
      const key = match[1];
      if (!key.startsWith("customer.") && !key.startsWith("sender.")) {
        keys.add(key);
      }
    }
    return [...keys];
  }, [fallbackValues, preview, subject, bodyHtml, customPlainText, bodyText]);

  function buildContentPayload(): {
    templateVersionId?: string;
    subject?: string;
    bodyHtml?: string;
    bodyText?: string | null;
  } {
    if (effectiveTemplateVersionId) {
      return { templateVersionId: effectiveTemplateVersionId };
    }
    return {
      subject,
      bodyHtml,
      bodyText: customPlainText ? bodyText : undefined,
    };
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
            subject,
            bodyHtml,
            bodyText: customPlainText ? bodyText : undefined,
            customerId: previewCustomerId || undefined,
            sampleData:
              Object.keys(fallbackValues).length > 0
                ? fallbackValues
                : undefined,
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

  async function sendTestToSelf() {
    setTestSendError(null);
    setTestSendResult(null);
    if (!senderAccountId) {
      setTestSendError("Choose a sender account first");
      return;
    }
    setTestSendLoading(true);
    try {
      const result = await apiFetch<ComposeTestSendResponse>(
        "/email-messages/test-send",
        {
          method: "POST",
          body: JSON.stringify({
            senderAccountId,
            customerId: previewCustomerId || undefined,
            fallbackValues:
              Object.keys(fallbackValues).length > 0
                ? fallbackValues
                : undefined,
            ...buildContentPayload(),
          }),
        },
      );
      setTestSendResult(result);
    } catch (err) {
      setTestSendError(
        err instanceof ApiError ? err.message : "Failed to send test email",
      );
    } finally {
      setTestSendLoading(false);
    }
  }

  function clearDraft() {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    setSenderAccountId(EMPTY_DRAFT.senderAccountId);
    setCategoryId(EMPTY_DRAFT.categoryId);
    setTemplateId(EMPTY_DRAFT.templateId);
    setTemplateSnapshot(null);
    setSelectedCustomers(new Map());
    setSubject(EMPTY_DRAFT.subject);
    setBodyHtml(EMPTY_DRAFT.bodyHtml);
    setCustomPlainText(EMPTY_DRAFT.customPlainText);
    setBodyText(EMPTY_DRAFT.bodyText);
    setTrackingEnabled(EMPTY_DRAFT.trackingEnabled);
    setOverrideSuppression(EMPTY_DRAFT.overrideSuppression);
    setFallbackValues(EMPTY_DRAFT.fallbackValues);
    setAttachments([]);
    setPreview(null);
    setPreviewCustomerId("");
  }

  async function handleSend() {
    setSendError(null);
    setSendResult(null);

    if (!senderAccountId) {
      setSendError("Choose a sender account");
      return;
    }
    if (selectedCustomers.size === 0) {
      setSendError("Add at least one recipient");
      return;
    }
    if (!effectiveTemplateVersionId && (!subject.trim() || !bodyHtml.trim())) {
      setSendError("Enter a subject and body, or pick a template");
      return;
    }
    if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      setSendError("Attachments exceed the 25 MB total limit");
      return;
    }

    setSending(true);
    try {
      const payload: ComposeSendRequest = {
        senderAccountId,
        customerIds: [...selectedCustomers.keys()],
        fallbackValues:
          Object.keys(fallbackValues).length > 0 ? fallbackValues : undefined,
        trackingEnabled,
        overrideSuppression:
          user?.role === "admin" ? overrideSuppression : undefined,
        ...buildContentPayload(),
      };
      const formData = new FormData();
      formData.append("payload", JSON.stringify(payload));
      for (const file of attachments) {
        formData.append("attachments", file);
      }
      const result = await apiFetch<ComposeSendResponse>(
        "/email-messages/compose",
        { method: "POST", body: formData },
      );
      setSendResult(result);

      const failedIds = new Set(
        result.results.filter((r) => !r.ok).map((r) => r.customerId),
      );
      if (failedIds.size === 0) {
        clearDraft();
      } else {
        setSelectedCustomers((prev) => {
          const next = new Map<string, CustomerSummary>();
          for (const [id, customer] of prev) {
            if (failedIds.has(id)) next.set(id, customer);
          }
          return next;
        });
        setAttachments([]);
      }
    } catch (err) {
      setSendError(
        err instanceof ApiError ? err.message : "Failed to send",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      )}

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          1. Sender account
        </h2>
        <select
          value={senderAccountId}
          onChange={(e) => setSenderAccountId(e.target.value)}
          className={INPUT_CLASS}
        >
          <option value="" disabled>
            Select a sender account
          </option>
          {senderAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.displayName
                ? `${account.displayName} <${account.email}>`
                : account.email}
              {" — "}
              {account.dailyQuota !== null
                ? `${account.dailyQuota - account.dailyUsed} left today`
                : "no daily limit"}
            </option>
          ))}
        </select>
        {selectedSenderAccount && (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Hourly:{" "}
            {selectedSenderAccount.hourlyQuota !== null
              ? `${selectedSenderAccount.hourlyUsed}/${selectedSenderAccount.hourlyQuota} used`
              : "no limit"}{" "}
            · Daily:{" "}
            {selectedSenderAccount.dailyQuota !== null
              ? `${selectedSenderAccount.dailyUsed}/${selectedSenderAccount.dailyQuota} used`
              : "no limit"}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          2. Recipients
        </h2>
        <input
          value={customerSearch}
          onChange={(e) => setCustomerSearch(e.target.value)}
          placeholder="Search customers by name or email"
          className={INPUT_CLASS}
        />
        {customerResults.length > 0 && (
          <ul className="mt-2 max-h-40 divide-y divide-zinc-200 overflow-y-auto rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {customerResults.map((customer) => (
              <li
                key={customer.id}
                className="flex items-center justify-between px-2 py-1.5 text-sm"
              >
                <span className="text-zinc-800 dark:text-zinc-200">
                  {customer.name}{" "}
                  <span className="text-zinc-500 dark:text-zinc-400">
                    ({customer.email})
                  </span>
                  {(customer.suppressed || customer.unsubscribed) && (
                    <span className="ml-2 text-xs text-red-600 dark:text-red-400">
                      {customer.unsubscribed ? "unsubscribed" : "suppressed"}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => addCustomer(customer)}
                  disabled={selectedCustomers.has(customer.id)}
                  className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-50"
                >
                  {selectedCustomers.has(customer.id) ? "Added" : "Add"}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {[...selectedCustomers.values()].map((customer) => (
            <span
              key={customer.id}
              className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {customer.name}
              {(customer.suppressed || customer.unsubscribed) && (
                <span className="text-red-600 dark:text-red-400">⚠</span>
              )}
              <button
                type="button"
                onClick={() => removeCustomer(customer.id)}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {selectedCustomers.size === 0 && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            No recipients selected yet.
          </p>
        )}
        {suppressedCount > 0 && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            {suppressedCount} selected recipient(s) are suppressed or
            unsubscribed and will be skipped unless{" "}
            {user?.role === "admin" ? "override is checked" : "an admin overrides"}
            .
          </p>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          3. Template (or write a custom email)
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select
            value={categoryId}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <select
            value={templateId}
            onChange={(e) => applyTemplateSelection(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value={BLANK_TEMPLATE_VALUE}>
              — Blank (write custom email) —
            </option>
            {[...templatesByCategory.entries()].map(
              ([categoryName, group]) => (
                <optgroup key={categoryName} label={categoryName}>
                  {group.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </optgroup>
              ),
            )}
          </select>
        </div>
        {isDirty && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            You&apos;ve edited this template&apos;s content — it will send as
            a custom message, not linked back to the template.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          4. Subject &amp; body
        </h2>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Subject
            </label>
            <div className="flex gap-2">
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={INPUT_CLASS}
              />
              <MergeFieldPicker
                fields={mergeFields}
                onInsert={(key) => insertMergeField(key, "subject")}
              />
            </div>
          </div>

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
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={10}
                className={`${INPUT_CLASS} font-mono text-xs`}
              />
            ) : (
              <RichTextEditor
                ref={editorRef}
                value={bodyHtml}
                onChange={setBodyHtml}
              />
            )}
          </div>

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
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          5. Per-recipient preview
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={previewCustomerId}
            onChange={(e) => setPreviewCustomerId(e.target.value)}
            className={`${INPUT_CLASS} w-64`}
          >
            <option value="">Sample data</option>
            {[...selectedCustomers.values()].map((customer) => (
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
        {previewError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {previewError}
          </p>
        )}
        {preview && (
          <div className="mt-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
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
          </div>
        )}
        {unresolvedKeys.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Missing merge values — provide a fallback:
            </p>
            {unresolvedKeys.map((key) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-40 shrink-0 text-xs text-zinc-600 dark:text-zinc-400">
                  {key}
                </span>
                <input
                  value={fallbackValues[key] ?? ""}
                  onChange={(e) =>
                    setFallbackValues((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  className={INPUT_CLASS}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          6. Attachments &amp; options
        </h2>
        <input
          type="file"
          multiple
          onChange={(e) =>
            setAttachments(e.target.files ? Array.from(e.target.files) : [])
          }
          className="text-sm text-zinc-700 dark:text-zinc-300"
        />
        {attachments.length > 0 && (
          <p
            className={`mt-1 text-xs ${
              totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES
                ? "text-red-600 dark:text-red-400"
                : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            {attachments.length} file(s), {formatBytes(totalAttachmentBytes)}{" "}
            of 25 MB limit
          </p>
        )}

        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={trackingEnabled}
              onChange={(e) => setTrackingEnabled(e.target.checked)}
            />
            Track opens &amp; clicks for this send
          </label>
          {user?.role === "admin" && (
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={overrideSuppression}
                onChange={(e) => setOverrideSuppression(e.target.checked)}
              />
              Override suppression / unsubscribe for this send
            </label>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {sending ? "Sending…" : `Send to ${selectedCustomers.size} recipient(s)`}
          </button>
          <button
            type="button"
            onClick={() => void sendTestToSelf()}
            disabled={testSendLoading}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {testSendLoading
              ? "Sending test…"
              : `Send test to myself (${user?.email ?? ""})`}
          </button>
          <button
            type="button"
            onClick={clearDraft}
            className="text-xs font-medium text-zinc-600 underline dark:text-zinc-400"
          >
            Clear draft
          </button>
        </div>

        {testSendResult && (
          <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
            Test email accepted for {testSendResult.to} ({testSendResult.smtpResponse}
            ).{" "}
            {testSendResult.unresolvedPlaceholders.length > 0 &&
              `Unresolved: ${testSendResult.unresolvedPlaceholders.join(", ")}`}
          </p>
        )}
        {testSendError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {testSendError}
          </p>
        )}
        {sendError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {sendError}
          </p>
        )}
        {sendResult && (
          <ul className="mt-3 space-y-1 text-sm">
            {sendResult.results.map((result) => (
              <li
                key={result.customerId}
                className={
                  result.ok
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }
              >
                {result.ok
                  ? `Queued for ${result.customerId}`
                  : `${result.customerId}: ${result.error}`}
              </li>
            ))}
          </ul>
        )}
      </section>
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
