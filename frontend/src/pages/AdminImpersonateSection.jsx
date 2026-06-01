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
      {others.map((u) => (
        <li key={u.id} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3">
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
        </li>
      ))}
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
