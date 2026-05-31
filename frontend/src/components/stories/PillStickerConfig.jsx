import { useState } from 'react';
import StickerContent from './StickerContent.jsx';

/* Shared bottom-sheet config for the two "pill" sticker types that are just
   typed text on a coloured chip: Location (a place name) and Now Playing (a
   song + artist). Both expose a text colour and a pill colour. Position /
   rotation are owned by the canvas, not edited here. */
const COLORS = ['#ffffff', '#000000', '#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#14b8a6'];

const PRESETS = {
  location: {
    title: 'Location',
    empty: { type: 'location', text: '', color: '#111827', bgColor: '#ffffff', rot: 0, x: 50, y: 45 },
  },
  playing: {
    title: 'Now playing',
    empty: { type: 'playing', title: '', artist: '', color: '#ffffff', bgColor: '#000000', rot: 0, x: 50, y: 45 },
  },
};

export default function PillStickerConfig({ kind, initial, onCancel, onSave, onDelete }) {
  const preset = PRESETS[kind] ?? PRESETS.location;
  const [draft, setDraft] = useState(() => ({ ...preset.empty, ...(initial ?? {}) }));
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const canSave = kind === 'location' ? !!draft.text.trim() : !!draft.title.trim();

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <button onClick={onCancel} className="text-sm text-neutral-500">Cancel</button>
          <span className="text-sm font-semibold">{preset.title} sticker</span>
          <button onClick={() => onSave(draft)} disabled={!canSave} className="text-sm font-semibold text-amber-700 disabled:opacity-40">
            Save
          </button>
        </header>

        <div className="max-h-[72vh] space-y-4 overflow-y-auto p-4">
          <div className="flex min-h-[80px] items-center justify-center rounded-2xl bg-gradient-to-br from-neutral-700 to-neutral-900 p-4">
            <StickerContent sticker={draft} />
          </div>

          {kind === 'location' ? (
            <div>
              <label className="text-xs font-semibold text-neutral-500">Place</label>
              <input
                value={draft.text}
                onChange={(e) => set({ text: e.target.value })}
                maxLength={60}
                autoFocus
                placeholder="e.g. City Kebab"
                className="mt-1 block w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-neutral-500">Song</label>
                <input
                  value={draft.title}
                  onChange={(e) => set({ title: e.target.value })}
                  maxLength={50}
                  autoFocus
                  placeholder="Class Historian"
                  className="mt-1 block w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-neutral-500">Artist</label>
                <input
                  value={draft.artist}
                  onChange={(e) => set({ artist: e.target.value })}
                  maxLength={50}
                  placeholder="BRONCHO"
                  className="mt-1 block w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-neutral-500">Text colour</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => set({ color: c })} aria-label={`Text ${c}`}
                  className={`h-8 w-8 rounded-full border transition ${draft.color === c ? 'ring-2 ring-amber-500 ring-offset-2' : 'border-neutral-300'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-500">Pill colour</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => set({ bgColor: c })} aria-label={`Pill ${c}`}
                  className={`h-8 w-8 rounded-full border transition ${draft.bgColor === c ? 'ring-2 ring-amber-500 ring-offset-2' : 'border-neutral-300'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          {onDelete && (
            <button type="button" onClick={onDelete}
              className="mt-2 w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              Remove sticker
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
