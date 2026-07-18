"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import type { UserRole } from "@tft/shared";
import { useAuth } from "@/lib/auth-context";

/**
 * Client-side defense-in-depth for role-gated pages: the API is the source
 * of truth (every mutating endpoint enforces `@Roles()` server-side), but
 * without this a user who lacks a role can still navigate straight to a
 * gated page URL and see a broken/erroring UI instead of being redirected.
 */
export function RequireRole({
  roles,
  children,
}: {
  roles: UserRole[];
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const allowed = Boolean(user && roles.includes(user.role));

  useEffect(() => {
    if (!loading && user && !allowed) {
      router.replace("/dashboard");
    }
  }, [loading, user, allowed, router]);

  if (loading || !user || !allowed) {
    return null;
  }

  return <>{children}</>;
}
