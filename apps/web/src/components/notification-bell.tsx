"use client";

import Link from "next/link";
import { useState } from "react";
import type { NotificationType } from "@tft/shared";
import { useNotifications } from "@/lib/notifications-context";

const TYPE_LABELS: Record<NotificationType, string> = {
  first_open: "Opened",
  click: "Clicked",
  reply: "Replied",
  bounce: "Bounced",
  send_failed: "Send failed",
  quota_warning: "Quota warning",
  follow_up_due: "Follow-up due",
  webhook_disabled: "Webhook disabled",
};

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } =
    useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Notifications"
        className="relative z-50 rounded-md border border-zinc-300 p-1.5 text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Click-outside catcher */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Notifications
              </span>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    Mark all read
                  </button>
                )}
                <Link
                  href="/dashboard/notifications"
                  onClick={() => setOpen(false)}
                  className="text-xs text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  Preferences
                </Link>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  No notifications yet.
                </p>
              )}
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`border-b border-zinc-100 px-3 py-2 text-sm last:border-b-0 dark:border-zinc-900 ${
                    notification.readAt
                      ? "text-zinc-500 dark:text-zinc-400"
                      : "bg-zinc-50 font-medium text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void markRead(notification.id)}
                    className="block w-full text-left"
                  >
                    <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      {TYPE_LABELS[notification.type]}
                    </span>
                    {notification.title}
                  </button>
                  {notification.type === "follow_up_due" &&
                    notification.messageId && (
                      <Link
                        href={`/dashboard/compose?followUpTo=${notification.messageId}`}
                        onClick={() => {
                          setOpen(false);
                          void markRead(notification.id);
                        }}
                        className="mt-1 inline-block text-xs font-medium text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Follow up →
                      </Link>
                    )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
      />
    </svg>
  );
}
