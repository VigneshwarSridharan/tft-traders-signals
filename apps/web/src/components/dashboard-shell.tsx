"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/templates", label: "Templates" },
  { href: "/dashboard/users", label: "Users", adminOnly: true },
  {
    href: "/dashboard/sender-accounts",
    label: "Sender Accounts",
    adminOnly: true,
  },
  {
    href: "/dashboard/custom-fields",
    label: "Custom Fields",
    adminOnly: true,
  },
  {
    href: "/dashboard/template-categories",
    label: "Template Categories",
    adminOnly: true,
  },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, pathname, router]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || user.role === "admin",
  );

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 dark:bg-black md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 md:w-56 md:border-b-0 md:border-r">
        <p className="mb-4 px-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Email Dashboard
        </p>
        <nav className="flex gap-1 md:flex-col">
          {visibleItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-2 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-50">
              {user.name}
            </span>{" "}
            ({user.role})
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void logout().then(() => router.push("/login"))}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}
