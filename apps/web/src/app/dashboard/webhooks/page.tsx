"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  CreateWebhookEndpointResponse,
  WebhookDeliveryListResponse,
  WebhookDeliverySummary,
  WebhookEndpointSummary,
  WebhookEventType,
} from "@tft/shared";
import { WEBHOOK_EVENT_TYPES } from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";
import { RequireRole } from "@/components/require-role";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

const EMPTY_FORM = { url: "", events: [] as WebhookEventType[] };

export default function WebhooksPage() {
  return (
    <RequireRole roles={["admin"]}>
      <WebhooksPageContent />
    </RequireRole>
  );
}

function WebhooksPageContent() {
  const [endpoints, setEndpoints] = useState<WebhookEndpointSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState(EMPTY_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await apiFetch<WebhookEndpointSummary[]>(
        "/webhook-endpoints",
      );
      setEndpoints(list);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load webhooks",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch endpoints on mount
    void loadData();
  }, [loadData]);

  function toggleEvent(event: WebhookEventType) {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch<CreateWebhookEndpointResponse>(
        "/webhook-endpoints",
        { method: "POST", body: JSON.stringify(form) },
      );
      setRevealedSecret(result.secret);
      setCopied(false);
      setForm(EMPTY_FORM);
      await loadData();
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "Failed to create webhook",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(endpoint: WebhookEndpointSummary) {
    setBusyId(endpoint.id);
    try {
      await apiFetch(`/webhook-endpoints/${endpoint.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !endpoint.isActive }),
      });
      await loadData();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to update webhook",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function toggleEndpointEvent(
    endpoint: WebhookEndpointSummary,
    eventType: WebhookEventType,
  ) {
    const events = endpoint.events.includes(eventType)
      ? endpoint.events.filter((e) => e !== eventType)
      : [...endpoint.events, eventType];
    if (events.length === 0) {
      setLoadError("An endpoint must be subscribed to at least one event.");
      return;
    }
    setBusyId(endpoint.id);
    try {
      await apiFetch(`/webhook-endpoints/${endpoint.id}`, {
        method: "PATCH",
        body: JSON.stringify({ events }),
      });
      await loadData();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to update webhook",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function sendTest(endpoint: WebhookEndpointSummary) {
    setBusyId(endpoint.id);
    try {
      await apiFetch(`/webhook-endpoints/${endpoint.id}/test-send`, {
        method: "POST",
      });
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to send test webhook",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function deleteEndpoint(endpoint: WebhookEndpointSummary) {
    if (
      !window.confirm(
        `Delete the webhook endpoint "${endpoint.url}"? This can't be undone.`,
      )
    ) {
      return;
    }
    setBusyId(endpoint.id);
    try {
      await apiFetch(`/webhook-endpoints/${endpoint.id}`, {
        method: "DELETE",
      });
      await loadData();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to delete webhook",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Add a webhook endpoint
        </h2>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          Deliveries are HMAC-SHA256 signed (header <code>X-Webhook-Signature</code>)
          with a secret shown once at creation, retried with backoff on
          failure, and the endpoint auto-disables after too many consecutive
          failures.
        </p>
        <form
          onSubmit={(event) => void handleCreate(event)}
          className="space-y-3"
        >
          <Field label="URL (https:// required)">
            <input
              required
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://example.com/webhooks/tft"
              className={INPUT_CLASS}
            />
          </Field>
          <div>
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Events
            </span>
            <div className="flex flex-wrap gap-3">
              {WEBHOOK_EVENT_TYPES.map((eventType) => (
                <label
                  key={eventType}
                  className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300"
                >
                  <input
                    type="checkbox"
                    checked={form.events.includes(eventType)}
                    onChange={() => toggleEvent(eventType)}
                  />
                  {eventType}
                </label>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting || form.events.length === 0}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting ? "Adding…" : "Add endpoint"}
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
            Your new webhook signing secret
          </h2>
          <p className="mb-2 text-xs text-amber-800 dark:text-amber-200">
            Copy it now — for your security, it won&apos;t be shown again. Use
            it to verify the <code>X-Webhook-Signature</code> header on every
            delivery.
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

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Endpoints
        </h2>
        {!loading && endpoints.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No webhook endpoints yet.
          </p>
        )}
        <div className="space-y-3">
          {endpoints.map((endpoint) => (
            <div
              key={endpoint.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-zinc-900 dark:text-zinc-50">
                    {endpoint.url}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {WEBHOOK_EVENT_TYPES.map((eventType) => {
                      const subscribed = endpoint.events.includes(eventType);
                      return (
                        <button
                          key={eventType}
                          type="button"
                          disabled={busyId === endpoint.id}
                          onClick={() =>
                            void toggleEndpointEvent(endpoint, eventType)
                          }
                          title="Click to toggle"
                          className={`rounded px-1.5 py-0.5 text-xs ${
                            subscribed
                              ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500"
                          }`}
                        >
                          {eventType}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {endpoint.isActive ? (
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      Active
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-red-600 dark:text-red-400">
                      Inactive
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <button
                  type="button"
                  disabled={busyId === endpoint.id}
                  onClick={() => void toggleActive(endpoint)}
                  className="font-medium text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  {endpoint.isActive ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  disabled={busyId === endpoint.id}
                  onClick={() => void sendTest(endpoint)}
                  className="font-medium text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Send test
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId(
                      expandedId === endpoint.id ? null : endpoint.id,
                    )
                  }
                  className="font-medium text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  {expandedId === endpoint.id ? "Hide" : "Show"} delivery log
                </button>
                <button
                  type="button"
                  disabled={busyId === endpoint.id}
                  onClick={() => void deleteEndpoint(endpoint)}
                  className="font-medium text-red-600 underline hover:text-red-800 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                >
                  Delete
                </button>
              </div>
              {expandedId === endpoint.id && (
                <DeliveryLog endpointId={endpoint.id} />
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DeliveryLog({ endpointId }: { endpointId: string }) {
  const [deliveries, setDeliveries] = useState<WebhookDeliverySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch delivery log when expanded
    setLoading(true);
    void apiFetch<WebhookDeliveryListResponse>(
      `/webhook-endpoints/${endpointId}/deliveries`,
    )
      .then((response) => {
        if (!cancelled) setDeliveries(response.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Failed to load delivery log",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [endpointId]);

  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            <th className="px-2 py-1.5 font-medium">Event</th>
            <th className="px-2 py-1.5 font-medium">Attempt</th>
            <th className="px-2 py-1.5 font-medium">Response</th>
            <th className="px-2 py-1.5 font-medium">Status</th>
            <th className="px-2 py-1.5 font-medium">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {loading && (
            <tr>
              <td
                colSpan={5}
                className="px-2 py-3 text-center text-zinc-500 dark:text-zinc-400"
              >
                Loading…
              </td>
            </tr>
          )}
          {error && (
            <tr>
              <td
                colSpan={5}
                className="px-2 py-3 text-center text-red-600 dark:text-red-400"
              >
                {error}
              </td>
            </tr>
          )}
          {!loading && !error && deliveries.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className="px-2 py-3 text-center text-zinc-500 dark:text-zinc-400"
              >
                No deliveries yet.
              </td>
            </tr>
          )}
          {deliveries.map((delivery) => (
            <tr key={delivery.id} className="text-zinc-800 dark:text-zinc-200">
              <td className="px-2 py-1.5">{delivery.eventType}</td>
              <td className="px-2 py-1.5">{delivery.attempt}</td>
              <td className="px-2 py-1.5">{delivery.responseStatus ?? "—"}</td>
              <td className="px-2 py-1.5">
                {delivery.delivered ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    Delivered
                  </span>
                ) : (
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Pending / failed
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5 text-zinc-500 dark:text-zinc-400">
                {new Date(delivery.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
