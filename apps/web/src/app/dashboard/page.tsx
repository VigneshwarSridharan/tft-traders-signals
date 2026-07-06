"use client";

import { useAuth } from "@/lib/auth-context";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-2">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Welcome{user ? `, ${user.name}` : ""}
      </h1>
      <p className="max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
        This is the dashboard shell. Sent-mail lists, analytics, and compose
        tools land here as later tasks in{" "}
        <code className="rounded bg-zinc-200 px-1.5 py-0.5 dark:bg-zinc-800">
          docs/TASKS.md
        </code>{" "}
        are implemented.
      </p>
    </div>
  );
}
