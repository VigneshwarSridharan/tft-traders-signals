"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type {
  RealtimeTrackingEvent,
  SentMailDetail,
  TagSummary,
} from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useRealtimeEvents } from "@/lib/realtime-context";
import { StatusBadge } from "../page";

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function SentMailDetailPage() {
  const params = useParams<{ id: string }>();
  const messageId = params.id;

  const [detail, setDetail] = useState<SentMailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [includeBotEvents, setIncludeBotEvents] = useState(false);
  const [tags, setTags] = useState<TagSummary[]>([]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const searchParams = new URLSearchParams();
      if (includeBotEvents) searchParams.set("includeBotEvents", "true");
      const data = await apiFetch<SentMailDetail>(
        `/sent-mail/${messageId}?${searchParams.toString()}`,
      );
      setDetail(data);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load message",
      );
    } finally {
      setLoading(false);
    }
  }, [messageId, includeBotEvents]);

  useEffect(() => {
    void apiFetch<TagSummary[]>("/tags").then(setTags);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch detail when the bot-events toggle changes
    void loadDetail();
  }, [loadDetail]);

  const handleRealtimeEvent = useCallback(
    (event: RealtimeTrackingEvent) => {
      if (event.messageId === messageId) {
        void loadDetail();
      }
    },
    [messageId, loadDetail],
  );

  useRealtimeEvents(handleRealtimeEvent);

  async function addTag(tagId: string) {
    if (!tagId) return;
    await apiFetch(`/sent-mail/${messageId}/tags`, {
      method: "POST",
      body: JSON.stringify({ tagId }),
    });
    await loadDetail();
  }

  async function removeTag(tagId: string) {
    await apiFetch(`/sent-mail/${messageId}/tags/${tagId}`, {
      method: "DELETE",
    });
    await loadDetail();
  }

  if (loading && !detail) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>;
  }

  if (loadError && !detail) {
    return <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>;
  }

  if (!detail) {
    return null;
  }

  const assignedTagIds = new Set(detail.tags.map((tag) => tag.id));
  const availableTags = tags.filter((tag) => !assignedTagIds.has(tag.id));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/sent-mail"
          className="text-xs font-medium text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          ← Back to Sent Mail
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {detail.subject ?? "(no subject)"}
          </h1>
          <StatusBadge status={detail.status} />
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          To {detail.toName ? `${detail.toName} <${detail.toEmail}>` : detail.toEmail}
        </p>
      </div>

      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Sender">
          {detail.senderAccountDisplayName ?? detail.senderAccountEmail}
        </SummaryCard>
        <SummaryCard label="Template">
          {detail.templateName ?? "Ad hoc"}
        </SummaryCard>
        <SummaryCard label="Sent at">{formatDate(detail.sentAt)}</SummaryCard>
        <SummaryCard label="Queued at">
          {formatDate(detail.queuedAt)}
        </SummaryCard>
        <SummaryCard label="First opened">
          {formatDate(detail.firstOpenedAt)}
        </SummaryCard>
        <SummaryCard label="Last opened">
          {formatDate(detail.lastOpenedAt)}
        </SummaryCard>
        <SummaryCard label="First clicked">
          {formatDate(detail.firstClickedAt)}
        </SummaryCard>
        <SummaryCard label="Replied at">
          {formatDate(detail.repliedAt)}
        </SummaryCard>
      </section>

      {detail.bounce && (
        <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <p className="font-medium">
            Bounce ({detail.bounce.bounceClass})
            {detail.bounce.statusCode ? ` — ${detail.bounce.statusCode}` : ""}
          </p>
          {detail.bounce.diagnostic && <p>{detail.bounce.diagnostic}</p>}
          <p className="text-xs">
            Bounced at {formatDate(detail.bounce.bouncedAt)}
          </p>
        </section>
      )}

      {detail.smtpResponse && (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            SMTP response
          </p>
          <p>{detail.smtpResponse}</p>
        </section>
      )}

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Tags
        </h2>
        <div className="flex flex-wrap items-center gap-1">
          {detail.tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => void removeTag(tag.id)}
                className="text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
                aria-label={`Remove tag ${tag.name}`}
              >
                ×
              </button>
            </span>
          ))}
          {availableTags.length > 0 && (
            <select
              value=""
              onChange={(e) => void addTag(e.target.value)}
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
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Rendered snapshot
        </h2>
        {detail.bodyHtmlRendered ? (
          <div
            className="max-h-[32rem] overflow-y-auto rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
            dangerouslySetInnerHTML={{ __html: detail.bodyHtmlRendered }}
          />
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No rendered body available.
          </p>
        )}
        {detail.attachments.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Attachments
            </p>
            <ul className="text-sm text-zinc-700 dark:text-zinc-300">
              {detail.attachments.map((attachment) => (
                <li key={attachment.id}>{attachment.filename}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Links ({detail.links.length})
        </h2>
        {detail.links.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No tracked links in this message.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[500px] text-left text-sm">
              <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Label</th>
                  <th className="px-3 py-2 font-medium">URL</th>
                  <th className="px-3 py-2 font-medium">Clicks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {detail.links.map((link) => (
                  <tr key={link.id} className="text-zinc-800 dark:text-zinc-200">
                    <td className="px-3 py-2">{link.linkLabel ?? "—"}</td>
                    <td className="max-w-md truncate px-3 py-2">
                      <a
                        href={link.originalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
                      >
                        {link.originalUrl}
                      </a>
                    </td>
                    <td className="px-3 py-2">{link.clickCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Event timeline ({detail.events.length})
          </h2>
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={includeBotEvents}
              onChange={(e) => setIncludeBotEvents(e.target.checked)}
            />
            Show bot events
          </label>
        </div>
        {detail.events.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No tracking events yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Occurred at</th>
                  <th className="px-3 py-2 font-medium">Device</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium">Link</th>
                  <th className="px-3 py-2 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {detail.events.map((event) => (
                  <tr key={event.id} className="text-zinc-800 dark:text-zinc-200">
                    <td className="px-3 py-2">{event.eventType}</td>
                    <td className="px-3 py-2">
                      {formatDate(event.occurredAt)}
                    </td>
                    <td className="px-3 py-2">
                      {[event.deviceType, event.os, event.browser]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {[event.geoCity, event.geoCountry]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                    <td className="max-w-xs truncate px-3 py-2">
                      {event.linkUrl ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {event.isBot && <FlagBadge label="Bot" />}
                        {event.isProxy && <FlagBadge label="Proxy" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="text-sm text-zinc-900 dark:text-zinc-50">{children}</p>
    </div>
  );
}

function FlagBadge({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
      {label}
    </span>
  );
}
