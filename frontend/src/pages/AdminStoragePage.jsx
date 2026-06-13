import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

/**
 * AdminStoragePage — /admin/storage
 * ----------------------------------
 * Disk data hygiene dashboard for uploaded Reel/Story video files.
 *
 * Access control: this route is matched by Caddy's @admin basicauth
 * (see caddy/Caddyfile — /admin /admin/* are listed), so only David's
 * credentials get past the browser's auth prompt. The endpoints it calls
 * (/api/admin/storage/reels*) also enforce requireAdmin() server-side.
 *
 * Lists every video upload from the Sneaky Stories / Reels feature with
 * its on-disk size and age, and lets the admin selectively delete the
 * file(s) + database record for anything 14+ days old. Deletion is atomic
 * per item (DB row removed in a transaction, then the file is unlinked) —
 * see backend/src/modules/storage/storage.repo.js.
 */

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function AdminStoragePage() {
  const [items, setItems] = useState(null);
  const [minAgeDays, setMinAgeDays] = useState(14);
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.listStorageReels();
      setItems(res.items ?? []);
      setMinAgeDays(res.min_age_days ?? 14);
      setSelected((prev) => {
        const ids = new Set((res.items ?? []).map((it) => it.id));
        return new Set([...prev].filter((id) => ids.has(id)));
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const eligible = useMemo(() => (items ?? []).filter((it) => it.eligible), [items]);
  const totalBytes = useMemo(() => (items ?? []).reduce((sum, it) => sum + it.size_bytes, 0), [items]);
  const selectedBytes = useMemo(
    () => (items ?? []).filter((it) => selected.has(it.id)).reduce((sum, it) => sum + it.size_bytes, 0),
    [items, selected],
  );

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllEligible() {
    setSelected(new Set(eligible.map((it) => it.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function clearSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Permanently delete ${selected.size} video file${selected.size === 1 ? '' : 's'} and its database record? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.admin.cleanupStorageReels([...selected]);
      setResult(res);
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">Storage hygiene</h1>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            Reel/Story video uploads on disk. Files {minAgeDays}+ days old can be cleared.
          </p>
        </div>
        <Link to="/admin" className="shrink-0 text-sm text-neutral-500 dark:text-neutral-400">Back</Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
          Deleted {result.deleted.length} file{result.deleted.length === 1 ? '' : 's'}
          {result.skipped.length > 0 && `, skipped ${result.skipped.length}`}
          {' · '}freed {formatBytes(result.freed_bytes)}.
        </div>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading...</p>
      ) : (items ?? []).length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No reel/story video uploads found.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800">
            <div className="text-sm text-neutral-600 dark:text-neutral-300">
              <p>{items.length} video upload{items.length === 1 ? '' : 's'} &middot; {formatBytes(totalBytes)} total</p>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {eligible.length} eligible for cleanup ({minAgeDays}+ days old) &middot; {formatBytes(eligible.reduce((s, it) => s + it.size_bytes, 0))}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={selectAllEligible}
                disabled={busy || eligible.length === 0}
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-40 dark:border-neutral-600 dark:text-neutral-200"
              >
                Select all eligible
              </button>
              <button
                onClick={clearSelection}
                disabled={busy || selected.size === 0}
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-40 dark:border-neutral-600 dark:text-neutral-200"
              >
                Clear selection
              </button>
            </div>
          </div>

          <ul className="space-y-2">
            {items.map((it) => (
              <ReelStorageRow
                key={it.id}
                item={it}
                selected={selected.has(it.id)}
                onToggle={() => toggle(it.id)}
                disabled={busy || !it.eligible}
              />
            ))}
          </ul>

          <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              {selected.size} selected &middot; {formatBytes(selectedBytes)}
            </p>
            <button
              onClick={clearSelected}
              disabled={busy || selected.size === 0}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? 'Clearing…' : 'Clear selected'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ReelStorageRow({ item, selected, onToggle, disabled }) {
  const createdLabel = new Date(item.created_at).toLocaleString();

  return (
    <li
      className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
        item.eligible
          ? 'border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800'
          : 'border-neutral-100 bg-neutral-50 opacity-70 dark:border-neutral-800 dark:bg-neutral-900'
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        disabled={disabled}
        className="h-4 w-4 shrink-0 accent-amber-600"
        aria-label="Select for cleanup"
      />

      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-700">
        {item.thumbnail_url ? (
          <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <video src={item.media_url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
          {item.caption || <span className="italic text-neutral-400 dark:text-neutral-500">(no caption)</span>}
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {item.author_name} &middot; {createdLabel}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span>{formatBytes(item.size_bytes)}</span>
          <span>&middot;</span>
          <span>{item.age_days}d old</span>
          {item.in_reel && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              in a reel
            </span>
          )}
          {!item.eligible && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300">
              too recent
            </span>
          )}
        </p>
      </div>
    </li>
  );
}
