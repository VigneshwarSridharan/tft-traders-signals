"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type {
  EmailMessageDetail,
  EmailMessageTimelineResponse,
  TagSummary,
  TrackingEventSummary,
} from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";

const INPUT_CLASS =
  "rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-xs text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function eventLabel(event: TrackingEventSummary): string {
  switch (event.eventType) {
    case "open":
      return "Open";
    case "open_inferred":
      return "Open (inferred)";
    case "click":
      return "Click";
    case "bounce":
      return "Bounce";
    case "reply":
      return "Reply";
    case "unsubscribe":
      return "Unsubscribe";
    case "spam_report":
      return "Spam report";
    default:
      return event.eventType;
  }
}

export default function SentMailDetailPage() {
  const params = useParams<{ id: string }>();
  const messageId = params.id;

  const [detail, setDetail] = useState<EmailMessageDetail | null>(null);
  const [timeline, setTimeline] = useState<EmailMessageTimelineResponse | null>(
    null,
  );
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [includeBotEvents, setIncludeBotEvents] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tagToAdd, setTagToAdd] = useState("");

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [detailData, timelineData, tagList] = await Promise.all([
        apiFetch<EmailMessageDetail>(`/email-messages/${messageId}`),
        apiFetch<EmailMessageTimelineResponse>(
          `/email-messages/${messageId}/timeline?includeBotEvents=${includeBotEvents}`,
        ),
        apiFetch<TagSummary[]>("/tags"),
      ]);
      setDetail(detailData);
      setTimeline(timelineData);
      setTags(tagList);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load message",
      );
    } finally {
      setLoading(false);
    }
  }, [messageId, includeBotEvents]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when the message or bot toggle changes
    void loadDetail();
  }, [loadDetail]);

  async function addTag(tagId: string) {
    if (!tagId) return;
    await apiFetch(`/email-messages/${messageId}/tags`, {
      method: "POST",
      body: JSON.stringify({ tagId }),
    });
    setTagToAdd("");
    await loadDetail();
  }

  async function removeTag(tagId: string) {
    await apiFetch(`/email-messages/${messageId}/tags/${tagId}`, {
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

  const assignedTagIds = new Set(detail.tags.map((t) => t.id));
  const availableTags = tags.filter((tag) => !assignedTagIds.has(tag.id));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/sent-mail"
          className="text-xs font-medium text-zinc-500 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← Back to Sent Mail
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {detail.subject ?? "(no subject)"}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          To {detail.toCustomerName} &lt;{detail.toEmail}&gt; from{" "}
          {detail.senderAccountDisplayName ?? detail.senderAccountEmail}
        </p>
      </div>

      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Status" value={detail.status} />
        <StatTile label="Sent at" value={formatDate(detail.sentAt)} />
        <StatTile
          label="Opens"
          value={`${detail.openCount}`}
          detail={`First: ${formatDate(detail.firstOpenedAt)} · Last: ${formatDate(detail.lastOpenedAt)}`}
        />
        <StatTile
          label="Clicks"
          value={`${detail.clickCount}`}
          detail={`First: ${formatDate(detail.firstClickedAt)} · Last: ${formatDate(detail.lastClickedAt)}`}
        />
      </section>

      {detail.bounce && (
        <section className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/30">
          <h2 className="mb-1 text-sm font-semibold text-red-800 dark:text-red-300">
            Bounce diagnostic ({detail.bounce.bounceClass})
          </h2>
          <p className="text-sm text-red-700 dark:text-red-300">
            {detail.bounce.statusCode && (
              <span className="font-mono">{detail.bounce.statusCode}</span>
            )}{" "}
            {detail.bounce.diagnostic}
          </p>
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            Bounced at {formatDate(detail.bounce.bouncedAt)}
          </p>
        </section>
      )}

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Tags
        </h2>
        <div className="flex flex-wrap items-center gap-2">
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
              value={tagToAdd}
              onChange={(e) => void addTag(e.target.value)}
              className={INPUT_CLASS}
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
        <div
          className="max-h-[500px] overflow-y-auto rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
          dangerouslySetInnerHTML={{
            __html: detail.bodyHtmlRendered ?? "<p>(no content)</p>",
          }}
        />
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Per-link clicks
        </h2>
        {timeline && timeline.links.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[500px] text-left text-sm">
              <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Link</th>
                  <th className="px-3 py-2 font-medium">Clicks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {timeline.links.map((link) => (
                  <tr key={link.id} className="text-zinc-800 dark:text-zinc-200">
                    <td className="px-3 py-2">
                      <a
                        href={link.originalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:no-underline"
                      >
                        {link.linkLabel ?? link.originalUrl}
                      </a>
                    </td>
                    <td className="px-3 py-2">{link.clickCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No tracked links on this message.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Event timeline
          </h2>
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={includeBotEvents}
              onChange={(e) => setIncludeBotEvents(e.target.checked)}
            />
            Show bot-flagged events
          </label>
        </div>
        {timeline && timeline.events.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Device</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium">Link</th>
                  <th className="px-3 py-2 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {timeline.events.map((event) => (
                  <tr
                    key={event.id}
                    className="text-zinc-800 dark:text-zinc-200"
                  >
                    <td className="px-3 py-2">{eventLabel(event)}</td>
                    <td className="px-3 py-2">{formatDate(event.occurredAt)}</td>
                    <td className="px-3 py-2">
                      {[event.deviceType, event.os, event.browser]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {[event.geoCity, event.geoCountry].filter(Boolean).join(", ") ||
                        "—"}
                    </td>
                    <td className="px-3 py-2">
                      {event.linkUrl ? (
                        <a
                          href={event.linkUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:no-underline"
                        >
                          {event.linkLabel ?? event.linkUrl}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {event.isBot && <FlagBadge label="Bot" />}
                        {event.isProxy && <FlagBadge label="Proxy" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No tracking events recorded yet.
          </p>
        )}
      </section>
    </div>
  );
}

function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
      {detail && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{detail}</p>
      )}
    </div>
  );
}

function FlagBadge({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
      {label}
    </span>
  );
}
