"use client";

import { useCallback, useEffect, useState } from "react";
import type { NotificationPreferences, NotificationType } from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";

const TYPE_LABELS: Record<NotificationType, string> = {
  first_open: "First open",
  click: "Click",
  reply: "Reply",
  bounce: "Bounce",
  send_failed: "Send failed",
  quota_warning: "Quota warning",
  follow_up_due: "Follow-up due",
  webhook_disabled: "Webhook disabled",
};

const TYPE_ORDER: NotificationType[] = [
  "first_open",
  "click",
  "reply",
  "bounce",
  "send_failed",
  "quota_warning",
  "follow_up_due",
  "webhook_disabled",
];

export default function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingType, setSavingType] = useState<NotificationType | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<NotificationPreferences>(
        "/notifications/preferences",
      );
      setPrefs(data);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load preferences",
      );
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  async function toggle(
    type: NotificationType,
    channel: "inApp" | "emailDigest",
  ) {
    if (!prefs) return;
    setSavingType(type);
    setSaveError(null);
    const next = { ...prefs[type], [channel]: !prefs[type][channel] };
    try {
      const updated = await apiFetch<NotificationPreferences>(
        "/notifications/preferences",
        {
          method: "PATCH",
          body: JSON.stringify({ [type]: next }),
        },
      );
      setPrefs(updated);
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : "Failed to save preference",
      );
    } finally {
      setSavingType(null);
    }
  }

  if (loadError) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
    );
  }
  if (!prefs) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Notification preferences
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Choose which events create an in-app notification for you.
        </p>
      </div>
      {saveError && (
        <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
      )}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">Event</th>
              <th className="px-3 py-2 font-medium">In-app</th>
              <th className="px-3 py-2 font-medium">Email digest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {TYPE_ORDER.map((type) => (
              <tr key={type} className="text-zinc-800 dark:text-zinc-200">
                <td className="px-3 py-2">{TYPE_LABELS[type]}</td>
                <td className="px-3 py-2">
                  <Toggle
                    checked={prefs[type].inApp}
                    disabled={savingType === type}
                    onChange={() => void toggle(type, "inApp")}
                  />
                </td>
                <td className="px-3 py-2">
                  <Toggle
                    checked={prefs[type].emailDigest}
                    disabled={savingType === type}
                    onChange={() => void toggle(type, "emailDigest")}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`h-5 w-9 rounded-full transition disabled:opacity-50 ${
        checked ? "bg-zinc-900 dark:bg-zinc-50" : "bg-zinc-300 dark:bg-zinc-700"
      }`}
    >
      <span
        className={`block h-4 w-4 rounded-full bg-white shadow transition dark:bg-zinc-900 ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
