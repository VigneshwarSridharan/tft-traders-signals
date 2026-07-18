"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { NotificationSummary } from "@tft/shared";
import { apiFetch } from "./api-client";
import { useAuth } from "./auth-context";
import { useRealtimeEvents } from "./realtime-context";

const POLL_INTERVAL_MS = 30_000;

interface NotificationsContextValue {
  notifications: NotificationSummary[];
  unreadCount: number;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<
  NotificationsContextValue | undefined
>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationSummary[]>(
    [],
  );
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    const [list, unread] = await Promise.all([
      apiFetch<NotificationSummary[]>("/notifications?limit=20"),
      apiFetch<{ count: number }>("/notifications/unread-count"),
    ]);
    setNotifications(list);
    setUnreadCount(unread.count);
  }, []);

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear on logout
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, refresh]);

  // A tracking event (open/click/reply) just streamed in — opportunistically
  // refresh so the bell doesn't lag behind activity already visible elsewhere.
  useRealtimeEvents(
    useCallback(() => {
      if (user) void refresh();
    }, [user, refresh]),
  );

  const markRead = useCallback(async (id: string) => {
    const updated = await apiFetch<NotificationSummary>(
      `/notifications/${id}/read`,
      { method: "POST" },
    );
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? updated : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await apiFetch("/notifications/read-all", { method: "POST" });
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? now })),
    );
    setUnreadCount(0);
  }, []);

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, refresh, markRead, markAllRead }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error(
      "useNotifications must be used within a NotificationsProvider",
    );
  }
  return ctx;
}
