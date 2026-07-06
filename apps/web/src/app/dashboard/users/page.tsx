"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  InvitationSummary,
  InviteUserResponse,
  UserRole,
  UserSummary,
} from "@tft/shared";
import { USER_ROLES } from "@tft/shared";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

export default function UsersAdminPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("agent");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [userList, invitationList] = await Promise.all([
        apiFetch<UserSummary[]>("/users"),
        apiFetch<InvitationSummary[]>("/users/invitations"),
      ]);
      setUsers(userList);
      setInvitations(invitationList);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch users/invitations on mount
    void loadData();
  }, [loadData]);

  if (currentUser && currentUser.role !== "admin") {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Only admins can manage users.
      </p>
    );
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteError(null);
    setAcceptUrl(null);
    setSubmitting(true);
    try {
      const response = await apiFetch<InviteUserResponse>(
        "/users/invitations",
        {
          method: "POST",
          body: JSON.stringify({ email, name, role }),
        },
      );
      setAcceptUrl(response.acceptUrl);
      setEmail("");
      setName("");
      setRole("agent");
      await loadData();
    } catch (err) {
      setInviteError(
        err instanceof ApiError ? err.message : "Failed to send invitation",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeInvitation(id: string) {
    await apiFetch(`/users/invitations/${id}`, { method: "DELETE" });
    await loadData();
  }

  async function toggleActive(targetUser: UserSummary) {
    await apiFetch(`/users/${targetUser.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !targetUser.isActive }),
    });
    await loadData();
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Invite a user
        </h2>
        <form
          onSubmit={(event) => void handleInvite(event)}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Name
            </label>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Email
            </label>
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Role
            </label>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
              className="rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:text-zinc-50"
            >
              {USER_ROLES.map((roleOption) => (
                <option key={roleOption} value={roleOption}>
                  {roleOption}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting ? "Sending…" : "Send invite"}
          </button>
        </form>
        {inviteError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {inviteError}
          </p>
        )}
        {acceptUrl && (
          <p className="mt-2 break-all text-sm text-zinc-600 dark:text-zinc-400">
            Invitation created. Share this link:{" "}
            <a href={acceptUrl} className="underline">
              {acceptUrl}
            </a>
          </p>
        )}
      </section>

      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Users
        </h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {!loading && users.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-4 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    No users yet.
                  </td>
                </tr>
              )}
              {users.map((row) => (
                <tr key={row.id} className="text-zinc-800 dark:text-zinc-200">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{row.email}</td>
                  <td className="px-3 py-2">{row.role}</td>
                  <td className="px-3 py-2">
                    {row.isActive ? "Active" : "Deactivated"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void toggleActive(row)}
                      className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                    >
                      {row.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {invitations.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Pending invitations
          </h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Expires</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {invitations.map((invite) => (
                  <tr
                    key={invite.id}
                    className="text-zinc-800 dark:text-zinc-200"
                  >
                    <td className="px-3 py-2">{invite.name}</td>
                    <td className="px-3 py-2">{invite.email}</td>
                    <td className="px-3 py-2">{invite.role}</td>
                    <td className="px-3 py-2">
                      {new Date(invite.expiresAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void revokeInvitation(invite.id)}
                        className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
