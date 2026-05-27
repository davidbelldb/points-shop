import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';

/* Picker sheet for "Save to highlight". Renders over a StoryViewer (z-60),
   so its dark backdrop pauses the visual attention on the underlying story.
   Returns nothing to the parent — calls onDone() on success so the parent
   can refresh / dismiss / advance as appropriate. */
export default function AddToReelModal({ storyId, onClose, onDone }) {
  const [reels, setReels] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.listReels().then(setReels).catch((e) => setErr(e.message));
  }, []);

  async function add(reelId) {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      await api.addStoryToReel(reelId, storyId);
      onDone?.();
      onClose();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true); setErr(null);
    try {
      await api.createReel({ name, initial_story_id: storyId });
      onDone?.();
      onClose();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <button onClick={onClose} className="text-sm text-neutral-500">Cancel</button>
          <span className="text-sm font-semibold">Save to highlight</span>
          <span className="w-12" />
        </header>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
          {creating ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-500">Reel name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Yosemite"
                autoFocus
                maxLength={40}
                className="block w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setCreating(false)} className="rounded-md px-3 py-1.5 text-sm text-neutral-600">Back</button>
                <button
                  onClick={createAndAdd}
                  disabled={!newName.trim() || busy}
                  className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-amber-950 disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-3 text-left text-sm font-semibold text-amber-700"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-white">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </span>
                Create new reel
              </button>

              {reels === null && <p className="text-sm text-neutral-500">Loading reels…</p>}
              {reels && reels.length === 0 && (
                <p className="text-xs text-neutral-400">No reels yet. Create your first one above.</p>
              )}

              {reels?.map((r) => (
                <button
                  key={r.id}
                  onClick={() => add(r.id)}
                  disabled={busy}
                  className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-left transition hover:shadow-sm disabled:opacity-60"
                >
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-neutral-200">
                    {r.cover_url ? (
                      r.cover_media_type === 'video' ? (
                        <video src={r.cover_url} className="h-full w-full object-cover" muted preload="metadata" playsInline />
                      ) : (
                        <img src={r.cover_url} alt="" className="h-full w-full object-cover" />
                      )
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-semibold text-neutral-900">{r.name}</p>
                    <p className="text-[11px] text-neutral-500">{r.story_count} stor{r.story_count === 1 ? 'y' : 'ies'}</p>
                  </div>
                </button>
              ))}
            </>
          )}

          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      </div>
    </div>
  );
}
