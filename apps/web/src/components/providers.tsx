"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import { RealtimeProvider } from "@/lib/realtime-context";
import { ThemeProvider } from "@/lib/theme-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RealtimeProvider>
          <NotificationsProvider>{children}</NotificationsProvider>
        </RealtimeProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
