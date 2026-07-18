"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type {
  CustomerErasureResult,
  CustomerGdprExport,
  CustomerSummary,
  CustomerTimelineEntry,
  CustomerTimelineEventType,
  CustomerTimelineResponse,
} from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

const TIMELINE_LABELS: Record<CustomerTimelineEventType, string> = {
  sent: "Sent",
  open: "Opened",
  click: "Clicked",
  reply: "Replied",
  bounce: "Bounced",
  unsubscribe: "Unsubscribed",
};

const TIMELINE_TONE: Record<CustomerTimelineEventType, string> = {
  sent: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  open: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  click: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  reply: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  bounce: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  unsubscribe: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

function TimelineBadge({ type }: { type: CustomerTimelineEventType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TIMELINE_TONE[type]}`}
    >
      {TIMELINE_LABELS[type]}
    </span>
  );
}

function TimelineRow({ entry }: { entry: CustomerTimelineEntry }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b border-zinc-100 py-2 last:border-b-0 dark:border-zinc-900">
      <div className="flex items-start gap-3">
        <TimelineBadge type={entry.type} />
        <div>
          <Link
            href={`/dashboard/sent-mail/${entry.messageId}`}
            className="text-sm text-zinc-900 underline hover:text-zinc-700 dark:text-zinc-50 dark:hover:text-zinc-300"
          >
            {entry.subject ?? "(no subject)"}
          </Link>
          {entry.detail && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {entry.detail}
            </p>
          )}
        </div>
      </div>
      <span className="whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400">
        {formatDate(entry.occurredAt)}
      </span>
    </li>
  );
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const customerId = params.id;
  const { user: currentUser } = useAuth();

  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [timeline, setTimeline] = useState<CustomerTimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gdprError, setGdprError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [erasing, setErasing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [customerData, timelineData] = await Promise.all([
        apiFetch<CustomerSummary>(`/customers/${customerId}`),
        apiFetch<CustomerTimelineResponse>(
          `/customers/${customerId}/timeline`,
        ),
      ]);
      setCustomer(customerData);
      setTimeline(timelineData.items);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load customer",
      );
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / id change
    void load();
  }, [load]);

  async function exportGdprData() {
    setGdprError(null);
    setExporting(true);
    try {
      const data = await apiFetch<CustomerGdprExport>(
        `/customers/${customerId}/gdpr-export`,
      );
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `customer-${customerId}-gdpr-export.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setGdprError(
        err instanceof ApiError ? err.message : "Failed to export data",
      );
    } finally {
      setExporting(false);
    }
  }

  async function eraseCustomer() {
    if (!customer) {
      return;
    }
    if (
      !window.confirm(
        `Permanently erase "${customer.name}" (${customer.email})? This deletes the customer record and cannot be undone. Their sent messages are anonymized and kept for aggregate reporting.`,
      )
    ) {
      return;
    }
    setGdprError(null);
    setErasing(true);
    try {
      await apiFetch<CustomerErasureResult>(`/customers/${customerId}/erase`, {
        method: "POST",
      });
      router.push("/dashboard/customers");
    } catch (err) {
      setGdprError(
        err instanceof ApiError ? err.message : "Failed to erase customer",
      );
      setErasing(false);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
    );
  }
  if (loadError || !customer) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        {loadError ?? "Customer not found"}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/customers"
              className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              ← Customers
            </Link>
          </div>
          <h1 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {customer.name}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {customer.email}
            {customer.company ? ` · ${customer.company}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {currentUser?.role === "admin" && (
            <>
              <button
                type="button"
                disabled={exporting}
                onClick={() => void exportGdprData()}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                {exporting ? "Exporting…" : "Export data (GDPR)"}
              </button>
              <button
                type="button"
                disabled={erasing}
                onClick={() => void eraseCustomer()}
                className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
              >
                {erasing ? "Erasing…" : "Erase customer"}
              </button>
            </>
          )}
          <Link
            href="/dashboard/compose"
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            New email
          </Link>
        </div>
      </div>

      {gdprError && (
        <p className="text-sm text-red-600 dark:text-red-400">{gdprError}</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Engagement score" value={customer.engagementScore} />
        <StatTile
          label="Tracking"
          value={customer.trackingOptOut ? "Opted out" : "Enabled"}
        />
        <StatTile
          label="Status"
          value={
            customer.unsubscribed
              ? "Unsubscribed"
              : customer.suppressed
                ? "Suppressed"
                : "Active"
          }
        />
        <StatTile label="Messages" value={timeline.filter((e) => e.type === "sent").length} />
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Communication timeline
        </h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No emails sent to this customer yet.
          </p>
        ) : (
          <ul>
            {timeline.map((entry) => (
              <TimelineRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}
