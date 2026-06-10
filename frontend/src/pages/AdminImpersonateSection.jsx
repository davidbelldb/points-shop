import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';

function Avatar({ url, name }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-neutral-400">
      {url ? (
        <img src={url} alt={name ?? ''} className="h-full w-full object-cover" />
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      )}
    </div>
  );
}

export default function AdminImpersonateSection({ bare = false }) {
  const { user, refresh } = useAuth();
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setUsers(await api.admin.listUsers()); }
    catch (e) { console.error(e); }
  }
  useEffect(() => { load(); }, []);

  if (user?.actual_role !== 'admin') return null;

  async function impersonate(id) {
    setBusy(true);
    try {
      await api.admin.startImpersonate(id);
      await refresh();
      window.location.href = '/';
    } finally { setBusy(false); }
  }

  async function stop() {
    setBusy(true);
    try {
      await api.admin.stopImpersonate();
      await refresh();
      window.location.href = '/admin';
    } finally { setBusy(false); }
  }

  async function mute(id, minutes) {
    setBusy(true);
    try {
      const updated = await api.admin.muteUser(id, minutes);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, notifications_muted_until: updated.notifications_muted_until } : u)));
    } finally { setBusy(false); }
  }

  async function unmute(id) {
    setBusy(true);
    try {
      await api.admin.unmuteUser(id);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, notifications_muted_until: null } : u)));
    } finally { setBusy(false); }
  }

  function muteLabel(until) {
    if (!until) return null;
    const ms = new Date(until).getTime() - Date.now();
    if (ms <= 0) return null;
    const mins = Math.ceil(ms / 60000);
    return mins >= 60 ? `muted ${Math.round(mins / 60)}h` : `muted ${mins}m`;
  }

  const others = users.filter((u) => u.id !== user.actual_id);

  const body = user.impersonating ? (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm text-amber-900">
        You're currently viewing the site as <strong>{user.username}</strong>.
      </p>
      <button
        onClick={stop}
        disabled={busy}
        className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-amber-900 disabled:opacity-40"
      >
        Stop impersonating
      </button>
    </div>
  ) : (
    <ul className="space-y-2">
      {others.map((u) => {
        const label = muteLabel(u.notifications_muted_until);
        return (
          <li key={u.id} className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar url={u.photo_url} name={u.name} />
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-neutral-500">{u.username} {'\u00b7'} {u.role}</p>
                </div>
              </div>
              <button
                onClick={() => impersonate(u.id)}
                disabled={busy}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-40"
              >
                View as
              </button>
            </div>
            <div className="flex items-center gap-2 border-t border-neutral-100 pt-2">
              <span className="text-xs text-neutral-500">
                Notifications: {label ? <span className="font-medium text-amber-600">{label}</span> : 'on'}
              </span>
              <div className="ml-auto flex gap-1.5">
                <button
                  onClick={() => mute(u.id, 30)}
                  disabled={busy}
                  className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700 disabled:opacity-40"
                >
                  Mute 30m
                </button>
                <button
                  onClick={() => mute(u.id, 60)}
                  disabled={busy}
                  className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700 disabled:opacity-40"
                >
                  Mute 1h
                </button>
                {label && (
                  <button
                    onClick={() => unmute(u.id)}
                    disabled={busy}
                    className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700 disabled:opacity-40"
                  >
                    Unmute
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );

  if (bare) return <div className="space-y-3">{body}</div>;
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Impersonate</h2>
      {body}
    </section>
  );
}
