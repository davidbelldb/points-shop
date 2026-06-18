import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import StoryViewer from './StoryViewer.jsx';

/* Modal for managing a highlight reel — rename it, remove individual
   stories, delete the whole reel, or tap "Play all" to open the StoryViewer
   queued through every story in chronological order.
   The reel is loaded fresh on mount so we always edit the current state. */
export default function ReelManager({ reelId, onClose, onChanged }) {
  const [reel, setReel]         = useState(null);
  const [name, setName]         = useState('');
  const [renaming, setRenaming] = useState(false);
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState(null);
  const [viewerStart, setViewerStart] = useState(null); // null | story index to play from
  const [coverBusy, setCoverBusy] = useState(false);

  async function changeCover(evt) {
    const input = evt.target;
    const f = input?.files?.[0];
    if (!f || coverBusy) return;
    setCoverBusy(true); setErr(null);
    try {
      const { url, type } = await api.upload(f);
      if (type !== 'image') throw new Error('Cover must be a photo.');
      await api.updateReel(reelId, { cover_image_url: url });
      await load();
      onChanged?.();
    } catch (err) { setErr(err.message); }
    finally {
      setCoverBusy(false);
      if (input) input.value = '';
    }
  }

  async function resetCover() {
    if (coverBusy) return;
    setCoverBusy(true); setErr(null);
    try {
      await api.updateReel(reelId, { cover_image_url: null });
      await load();
      onChanged?.();
    } catch (e) { setErr(e.message); }
    finally { setCoverBusy(false); }
  }

  async function load() {
    try {
      const r = await api.getReel(reelId);
      setReel(r);
      setName(r.name);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [reelId]);

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    if (trimmed === reel?.name) { setRenaming(false); return; }
    setBusy(true); setErr(null);
    try {
      await api.updateReel(reelId, { name: trimmed });
      setRenaming(false);
      await load();
      onChanged?.();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function removeStory(storyId) {
    if (!confirm('Remove this story from the reel? The story itself will stay in your archive.')) return;
    setBusy(true); setErr(null);
    try {
      await api.removeStoryFromReel(reelId, storyId);
      await load();
      onChanged?.();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function deleteReel() {
    if (!confirm(`Delete "${reel?.name}"? The reel will be removed but the stories inside it stay in your archive.`)) return;
    setBusy(true); setErr(null);
    try {
      await api.deleteReel(reelId);
      onChanged?.();
      onClose();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  if (!reel) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <p className="rounded-2xl bg-white px-4 py-3 text-sm text-neutral-600">Loading reel…</p>
      </div>
    );
  }

  const orderedStories = reel.stories ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex h-full w-full max-w-md flex-col bg-white sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
        <header className="sheet-safe-top flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <button onClick={onClose} className="text-sm text-neutral-500">Close</button>
          {renaming ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoFocus
              className="mx-3 flex-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-sm font-semibold text-neutral-900 focus:outline-none"
            />
          ) : (
            <button
              onClick={() => setRenaming(true)}
              className="mx-3 flex flex-1 items-center justify-center gap-1.5 truncate text-sm font-semibold text-neutral-900"
              aria-label="Rename reel"
            >
              <span className="truncate">{reel.name}</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-neutral-400">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
            </button>
          )}
          {renaming ? (
            <button onClick={saveName} disabled={!name.trim() || busy} className="text-sm font-semibold text-amber-700 disabled:opacity-40">Save</button>
          ) : (
            <button
              onClick={() => orderedStories.length && setViewerStart(0)}
              disabled={orderedStories.length === 0}
              className="text-sm font-semibold text-amber-700 disabled:opacity-40"
            >
              Play all
            </button>
          )}
        </header>

        <div className="sheet-safe-bottom flex-1 space-y-3 overflow-y-auto p-4">
          {err && <p className="text-xs text-red-600">{err}</p>}

          {/* Cover photo manager. Falls back through cover_image_url
              (custom upload) → cover_story_id → latest story, with a
              silhouette placeholder when the reel has nothing in it yet. */}
          <div className="flex flex-col items-center gap-2 pb-2">
            <label className="cursor-pointer">
              <span className="block h-24 w-24 overflow-hidden rounded-full bg-neutral-200 shadow-sm ring-1 ring-neutral-300">
                {reel.cover_url ? (
                  reel.cover_media_type === 'video' ? (
                    <video src={reel.cover_url} className="h-full w-full object-cover" muted preload="metadata" playsInline />
                  ) : (
                    <img src={reel.cover_url} alt="" className="h-full w-full object-cover" />
                  )
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-neutral-400">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="6" width="18" height="13" rx="2" />
                      <circle cx="12" cy="13" r="3.5" />
                      <path d="M8 6l1.5-2h5L16 6" />
                    </svg>
                  </span>
                )}
              </span>
              <input type="file" accept="image/*" onChange={changeCover} className="hidden" />
            </label>
            <span className="text-xs font-semibold text-amber-700">
              {coverBusy ? 'Uploading…' : 'Tap to change cover'}
            </span>
            {reel.cover_image_url && (
              <button type="button" onClick={resetCover} disabled={coverBusy} className="text-[11px] text-neutral-500 underline disabled:opacity-40">
                Use latest story as cover
              </button>
            )}
          </div>

          <p className="text-xs text-neutral-500">
            {orderedStories.length} stor{orderedStories.length === 1 ? 'y' : 'ies'} in this reel
          </p>

          {orderedStories.length === 0 ? (
            <p className="text-sm text-neutral-500">No stories yet. Save a story to this reel from the viewer.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {orderedStories.map((s, idx) => (
                <div key={s.id} className="relative">
                  <button
                    onClick={() => setViewerStart(idx)}
                    className="block aspect-square w-full overflow-hidden rounded-lg bg-neutral-100"
                  >
                    {s.media_type === 'video' ? (
                      <>
                        <video src={s.media_url} className="h-full w-full object-cover" muted preload="metadata" playsInline />
                        <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">▶</span>
                      </>
                    ) : (
                      <img src={s.media_url} alt="" className="h-full w-full object-cover" />
                    )}
                  </button>
                  <button
                    onClick={() => removeStory(s.id)}
                    aria-label="Remove from reel"
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-neutral-600 shadow ring-1 ring-neutral-200 hover:text-red-600"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="6" y1="6" x2="18" y2="18" />
                      <line x1="18" y1="6" x2="6" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={deleteReel}
            disabled={busy}
            className="mt-4 w-full rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-40"
          >
            Delete this reel
          </button>
        </div>
      </div>

      {viewerStart !== null && orderedStories.length > 0 && (
        <StoryViewer
          stories={orderedStories}
          initialIndex={viewerStart}
          onClose={() => { setViewerStart(null); load(); }}
          onStoryDeleted={() => { load(); onChanged?.(); }}
        />
      )}
    </div>
  );
}
