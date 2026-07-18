"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  ComplianceSettings,
  PlatformSettings,
  RetentionSettings,
} from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";
import { RequireRole } from "@/components/require-role";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

export default function SettingsPage() {
  return (
    <RequireRole roles={["admin"]}>
      <SettingsPageContent />
    </RequireRole>
  );
}

function SettingsPageContent() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [compliance, setCompliance] = useState<ComplianceSettings>({
    physicalAddress: "",
  });
  const [retention, setRetention] = useState<RetentionSettings>({
    rawEventsDays: 180,
    piiDays: 730,
  });

  const [savingCompliance, setSavingCompliance] = useState(false);
  const [complianceError, setComplianceError] = useState<string | null>(null);
  const [complianceSaved, setComplianceSaved] = useState(false);

  const [savingRetention, setSavingRetention] = useState(false);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [retentionSaved, setRetentionSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const settings = await apiFetch<PlatformSettings>("/settings");
      setCompliance(settings.compliance);
      setRetention(settings.retention);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load settings",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch settings on mount
    void load();
  }, [load]);

  async function saveCompliance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setComplianceError(null);
    setComplianceSaved(false);
    setSavingCompliance(true);
    try {
      const updated = await apiFetch<ComplianceSettings>(
        "/settings/compliance",
        { method: "PATCH", body: JSON.stringify(compliance) },
      );
      setCompliance(updated);
      setComplianceSaved(true);
    } catch (err) {
      setComplianceError(
        err instanceof ApiError ? err.message : "Failed to save",
      );
    } finally {
      setSavingCompliance(false);
    }
  }

  async function saveRetention(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRetentionError(null);
    setRetentionSaved(false);
    setSavingRetention(true);
    try {
      const updated = await apiFetch<RetentionSettings>("/settings/retention", {
        method: "PATCH",
        body: JSON.stringify(retention),
      });
      setRetention(updated);
      setRetentionSaved(true);
    } catch (err) {
      setRetentionError(
        err instanceof ApiError ? err.message : "Failed to save",
      );
    } finally {
      setSavingRetention(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>;
  }

  return (
    <div className="max-w-xl space-y-8">
      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      )}

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Compliance
        </h2>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          CAN-SPAM requires a valid physical postal address in every
          commercial email. It&apos;s appended, along with an unsubscribe
          link, to the footer of every outbound message — this can&apos;t be
          removed by editing a template.
        </p>
        <form onSubmit={(event) => void saveCompliance(event)} className="space-y-3">
          <Field label="Physical mailing address">
            <textarea
              rows={2}
              value={compliance.physicalAddress}
              onChange={(e) =>
                setCompliance({ physicalAddress: e.target.value })
              }
              placeholder="123 Main St, Springfield, USA"
              className={INPUT_CLASS}
            />
          </Field>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={savingCompliance}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {savingCompliance ? "Saving…" : "Save"}
            </button>
            {complianceSaved && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                Saved
              </span>
            )}
          </div>
          {complianceError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {complianceError}
            </p>
          )}
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Data retention
        </h2>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          Raw tracking events (opens/clicks) older than this are purged
          entirely; daily analytics rollups are kept forever. IP addresses
          are truncated to their network prefix separately, on a shorter
          window.
        </p>
        <form
          onSubmit={(event) => void saveRetention(event)}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <Field label="Raw event retention (days)">
            <input
              type="number"
              min={1}
              required
              value={retention.rawEventsDays}
              onChange={(e) =>
                setRetention({
                  ...retention,
                  rawEventsDays: Number(e.target.value),
                })
              }
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="IP truncation window (days)">
            <input
              type="number"
              min={1}
              required
              value={retention.piiDays}
              onChange={(e) =>
                setRetention({ ...retention, piiDays: Number(e.target.value) })
              }
              className={INPUT_CLASS}
            />
          </Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={savingRetention}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {savingRetention ? "Saving…" : "Save"}
            </button>
            {retentionSaved && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                Saved
              </span>
            )}
          </div>
          {retentionError && (
            <p className="text-sm text-red-600 dark:text-red-400 sm:col-span-2">
              {retentionError}
            </p>
          )}
        </form>
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
