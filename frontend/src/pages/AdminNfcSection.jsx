import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { nfcSupported, writeNfcUrl, eraseNfcTag } from '../lib/nfc.js';

// Slot links must point at the real domain (not https://localhost in the shell).
const SHARE_BASE = 'https://sneakypoints.com';
const slotUrl = (slug) => `${SHARE_BASE}/t/${slug}`;

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
  catch { return ''; }
}

/* Story chooser overlay for a slot. Neutral surfaces auto-flip in dark mode
   (the app inverts the neutral scale via CSS vars), so no dark: variants. */
function StoryPicker({ stories, onPick, onClose }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <span className="text-sm font-semibold text-neutral-900">Assign a story</span>
          <button onClick={onClose} className="text-sm text-neutral-500">Close</button>
        </header>
        <div className="grid grid-cols-3 gap-2 overflow-y-auto p-3">
          {stories.length === 0 && (
            <p className="col-span-3 py-6 text-center text-sm text-neutral-500">No stories yet.</p>
          )}
          {stories.map((s) => (
            <button
              key={s.id}
              onClick={() => onPick(s)}
              className="relative block h-28 w-full overflow-hidden rounded-lg bg-neutral-200 active:scale-95"
            >
              {s.thumb ? (
                <img src={s.thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs text-neutral-500">
                  {s.media_type}
                </span>
              )}
              {s.secret && (
                <span className="absolute left-1 top-1 rounded bg-red-500 px-1 text-[9px] font-bold text-white">HIDDEN</span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-black/50 px-1 py-0.5 text-[9px] text-white">
                {fmtDate(s.created_at)}{s.caption ? ` · ${s.caption}` : ''}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminNfcSection() {
  const [slots, setSlots] = useState([]);
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pickerSlot, setPickerSlot] = useState(null);
  const [write, setWrite] = useState({ id: null, status: 'idle', msg: null }); // per-slot write feedback
  const supported = nfcSupported();

  async function load() {
    setLoading(true); setError(null);
    try {
      const [sl, st] = await Promise.all([api.admin.nfcSlots(), api.admin.nfcMyStories()]);
      setSlots(sl); setStories(st);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function addSlot() {
    try {
      const n = slots.length + 1;
      await api.admin.createNfcSlot(`Hidden story ${n}`);
      await load();
    } catch (e) { setError(e.message); }
  }

  async function rename(id, label) {
    try { await api.admin.updateNfcSlot(id, { label }); }
    catch (e) { setError(e.message); }
  }

  async function assign(slotId, storyId) {
    try {
      await api.admin.updateNfcSlot(slotId, { story_id: storyId });
      setPickerSlot(null);
      await load();
    } catch (e) { setError(e.message); }
  }

  async function removeSlot(id) {
    if (!confirm('Delete this tag slot? The physical tag will stop resolving.')) return;
    try { await api.admin.deleteNfcSlot(id); await load(); }
    catch (e) { setError(e.message); }
  }

  async function writeSlot(slot) {
    setWrite({ id: slot.id, status: 'writing', msg: null });
    try {
      await writeNfcUrl(slotUrl(slot.slug));
      setWrite({ id: slot.id, status: 'done', msg: null });
    } catch (e) {
      if (e?.message === 'cancelled') { setWrite({ id: null, status: 'idle', msg: null }); return; }
      setWrite({ id: slot.id, status: 'error', msg: e?.message || 'Write failed.' });
    }
  }

  async function wipe() {
    setWrite({ id: 'wipe', status: 'writing', msg: null });
    try {
      await eraseNfcTag();
      setWrite({ id: 'wipe', status: 'done', msg: null });
    } catch (e) {
      if (e?.message === 'cancelled') { setWrite({ id: null, status: 'idle', msg: null }); return; }
      setWrite({ id: 'wipe', status: 'error', msg: e?.message || 'Wipe failed.' });
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600">
        Write each tag once, then point it at any story from here — reassign
        anytime without rewriting the tag. Scanning a tag opens its current story
        in the app.
      </p>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <>
          {slots.map((slot) => {
            const w = write.id === slot.id ? write : null;
            return (
              <div key={slot.id} className="rounded-xl border border-neutral-200 p-3">
                <div className="flex items-center gap-2">
                  <input
                    defaultValue={slot.label}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== slot.label && rename(slot.id, e.target.value.trim())}
                    className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm font-semibold text-neutral-900 focus:border-amber-500 focus:outline-none"
                  />
                  <button onClick={() => removeSlot(slot.id)} aria-label="Delete slot" className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-600">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" /></svg>
                  </button>
                </div>

                {/* Current assignment */}
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-14 w-11 shrink-0 overflow-hidden rounded-md bg-neutral-200">
                    {slot.story_thumb ? (
                      <img src={slot.story_thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[10px] text-neutral-500">none</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-neutral-800">
                      {slot.story_id ? (slot.story_caption || 'Story assigned') : 'No story assigned'}
                    </p>
                    <p className="truncate text-xs text-neutral-400">{slotUrl(slot.slug)}</p>
                  </div>
                  <button
                    onClick={() => setPickerSlot(slot)}
                    className="shrink-0 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900"
                  >
                    {slot.story_id ? 'Change' : 'Assign'}
                  </button>
                </div>

                {/* Write to tag */}
                {supported && (
                  <div className="mt-2">
                    <button
                      onClick={() => writeSlot(slot)}
                      disabled={w?.status === 'writing'}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-400 bg-white py-2 text-xs font-semibold text-red-600 active:scale-95 disabled:opacity-60"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8a10 10 0 0 1 14 0" /><path d="M8.5 11.5a5 5 0 0 1 7 0" /><circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" /></svg>
                      {w?.status === 'writing' ? 'Hold near the tag…' : w?.status === 'done' ? 'Written ✓' : 'Write this slot to a tag'}
                    </button>
                    {w?.status === 'error' && w.msg && <p className="mt-1 text-center text-xs text-red-600">{w.msg}</p>}
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={addSlot}
            className="w-full rounded-xl border-2 border-dashed border-neutral-300 py-2.5 text-sm font-semibold text-neutral-600 active:scale-[0.99]"
          >
            + New tag slot
          </button>

          {supported && (
            <div className="border-t border-neutral-200 pt-3">
              <button
                onClick={wipe}
                disabled={write.id === 'wipe' && write.status === 'writing'}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" /></svg>
                {write.id === 'wipe' && write.status === 'writing' ? 'Hold near the tag…' : write.id === 'wipe' && write.status === 'done' ? 'Tag wiped ✓' : 'Wipe a blank tag'}
              </button>
              {write.id === 'wipe' && write.status === 'error' && write.msg && (
                <p className="mt-1 text-center text-xs text-red-600">{write.msg}</p>
              )}
            </div>
          )}

          {!supported && (
            <p className="rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-neutral-500">
              Open the app on your iPhone to write or wipe tags. You can still
              manage slots and assignments here.
            </p>
          )}
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {pickerSlot && (
        <StoryPicker
          stories={stories}
          onPick={(s) => assign(pickerSlot.id, s.id)}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  );
}
