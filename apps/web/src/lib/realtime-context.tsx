"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeTrackingEvent } from "@tft/shared";
import { useAuth } from "./auth-context";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const TOAST_TTL_MS = 6_000;

export type RealtimeListener = (event: RealtimeTrackingEvent) => void;

interface ToastItem {
  id: string;
  message: string;
}

interface RealtimeContextValue {
  subscribe: (listener: RealtimeListener) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | undefined>(
  undefined,
);

function toastMessage(event: RealtimeTrackingEvent): string | null {
  const who = event.toName ?? event.toEmail;
  const subject = event.subject ?? "your email";
  if (event.eventType === "reply") return `${who} replied to "${subject}"`;
  if (event.isFirstOpen) return `${who} opened "${subject}"`;
  if (event.isFirstClick) return `${who} clicked a link in "${subject}"`;
  return null;
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const listenersRef = useRef<Set<RealtimeListener>>(new Set());
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (!user) return;

    const source = new EventSource(`${API_URL}/realtime/stream`, {
      withCredentials: true,
    });

    source.addEventListener("tracking_event", (raw: Event) => {
      const event = JSON.parse(
        (raw as MessageEvent<string>).data,
      ) as RealtimeTrackingEvent;

      listenersRef.current.forEach((listener) => listener(event));

      const message = toastMessage(event);
      if (message) {
        const id = `${event.messageId}-${event.eventType}-${event.occurredAt}`;
        setToasts((prev) => [...prev, { id, message }]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, TOAST_TTL_MS);
      }
    });

    return () => source.close();
  }, [user]);

  function subscribe(listener: RealtimeListener): () => void {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }

  function dismissToast(id: string): void {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  return (
    <RealtimeContext.Provider value={{ subscribe }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </RealtimeContext.Provider>
  );
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-800 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/** Subscribes `listener` to live tracking events for the lifetime of the calling component. */
export function useRealtimeEvents(listener: RealtimeListener): void {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error("useRealtimeEvents must be used within a RealtimeProvider");
  }
  useEffect(() => ctx.subscribe(listener), [ctx, listener]);
}
