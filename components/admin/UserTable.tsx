'use client';

import { useState } from 'react';
import { ShieldCheck, Trash2, Loader2 } from 'lucide-react';

/**
 * The account list, with the two actions an owner actually needs: change a
 * role, and remove an account.
 *
 * Every guard is enforced on the server — this component disables buttons to
 * explain *why* something is not allowed, but a disabled button is a courtesy,
 * never the check.
 */

export interface AdminUser {
  profile_id: string;
  email: string;
  display_name: string | null;
  username: string | null;
  role: string;
  created_at: string;
  project_count: number;
  published_count: number;
  is_owner: boolean;
  is_disposable: boolean;
  is_self: boolean;
}

const ROLES = ['child', 'parent', 'admin'];

export function UserTable({ initialUsers }: { initialUsers: AdminUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [hideDisposable, setHideDisposable] = useState(false);

  const changeRole = async (u: AdminUser, role: string) => {
    setBusy(u.profile_id);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: u.profile_id, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not change the role.');
      setUsers((prev) =>
        prev.map((x) => (x.profile_id === u.profile_id ? { ...x, role } : x))
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (u: AdminUser) => {
    // The server requires the email back as confirmation; ask for it here so
    // the round trip cannot fail for a reason the person did not expect.
    const typed = window.prompt(
      `This permanently deletes ${u.email} and their ${u.project_count} project(s).\n\nType the email address to confirm:`
    );
    if (!typed) return;
    setBusy(u.profile_id);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: u.profile_id, confirmEmail: typed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete the account.');
      setUsers((prev) => prev.filter((x) => x.profile_id !== u.profile_id));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const shown = users.filter((u) => {
    if (hideDisposable && u.is_disposable) return false;
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      (u.display_name ?? '').toLowerCase().includes(q) ||
      (u.username ?? '').toLowerCase().includes(q)
    );
  });

  const disposableCount = users.filter((u) => u.is_disposable).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by email or name…"
          className="min-w-[220px] flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm outline-none focus:border-slate-400"
        />
        {disposableCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={hideDisposable}
              onChange={(e) => setHideDisposable(e.target.checked)}
            />
            Hide {disposableCount} test account{disposableCount === 1 ? '' : 's'}
          </label>
        )}
        <span className="text-sm text-slate-500">
          {shown.length} of {users.length}
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Account</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Projects</th>
              <th className="px-4 py-2.5">Joined</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.profile_id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-medium text-slate-900">
                    {u.display_name || u.username || '—'}
                    {u.is_owner && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                        <ShieldCheck className="h-3 w-3" /> OWNER
                      </span>
                    )}
                    {u.is_self && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        YOU
                      </span>
                    )}
                    {u.is_disposable && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        TEST
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    disabled={busy === u.profile_id || u.is_self}
                    onChange={(e) => changeRole(u, e.target.value)}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm disabled:opacity-50"
                    title={u.is_self ? 'You cannot change your own role' : undefined}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {u.project_count}
                  {u.published_count > 0 && (
                    <span className="ml-1 text-xs text-slate-400">({u.published_count} public)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => remove(u)}
                    disabled={busy === u.profile_id || u.is_self || u.is_owner || u.role === 'admin'}
                    title={
                      u.is_self
                        ? 'You cannot delete your own account'
                        : u.is_owner
                          ? 'Owner accounts cannot be deleted here'
                          : u.role === 'admin'
                            ? 'Demote this administrator first'
                            : 'Delete this account and its projects'
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    {busy === u.profile_id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                  No accounts match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default UserTable;
