import { useState } from 'react';
import TextSticker from './TextSticker.jsx';

/* Bottom-sheet modal for composing a floating text sticker: the text itself,
   a colour from a fixed palette, a size, and an optional translucent
   background pill for readability over busy media. Live preview up top shows
   exactly what lands on the story. Position (x/y %) is owned by the canvas
   drag, so it's preserved across edits and not touched here. */
const COLORS = ['#ffffff', '#000000', '#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#14b8a6'];
const PILL_COLORS = ['rgba(0,0,0,0.45)', '#000000', '#ffffff', '#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];
const SIZES = [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']];
const EMPTY = { type: 'text', text: '', color: '#ffffff', size: 'm', bg: true, bgColor: 'rgba(0,0,0,0.45)', rot: 0, x: 50, y: 45 };

export default function TextStickerConfig({ initial, onCancel, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => ({ ...EMPTY, ...(initial ?? {}) }));
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <button onClick={onCancel} className="text-sm text-neutral-500">Cancel</button>
          <span className="text-sm font-semibold">Text sticker</span>
          <button
            onClick={() => onSave(draft)}
            disabled={!draft.text.trim()}
            className="text-sm font-semibold text-amber-700 disabled:opacity-40"
          >
            Save
          </button>
        </header>

        <div className="max-h-[72vh] space-y-4 overflow-y-auto p-4">
          {/* Live preview on a checkerboard-ish neutral so colour + pill read clearly. */}
          <div className="flex min-h-[88px] items-center justify-center rounded-2xl bg-gradient-to-br from-neutral-700 to-neutral-900 p-4">
            <TextSticker sticker={{ ...draft, text: draft.text || 'Your text' }} />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-500">Text</label>
            <textarea
              value={draft.text}
              onChange={(e) => set({ text: e.target.value })}
              maxLength={120}
              rows={2}
              autoFocus
              placeholder="Type something…"
              className="mt-1 block w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-500">Colour</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set({ color: c })}
                  aria-label={`Colour ${c}`}
                  className={`h-8 w-8 rounded-full border transition ${
                    draft.color === c ? 'ring-2 ring-amber-500 ring-offset-2' : 'border-neutral-300'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-500">Size</label>
            <div className="mt-1.5 inline-flex overflow-hidden rounded-lg border border-neutral-200">
              {SIZES.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => set({ size: id })}
                  className={`px-3 py-1.5 text-xs font-semibold ${
                    draft.size === id ? 'bg-amber-500 text-amber-950' : 'bg-white text-neutral-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-500">Pill colour</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {PILL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set({ bgColor: c })}
                  aria-label={`Pill colour ${c}`}
                  className={`h-8 w-8 rounded-full border transition ${
                    draft.bgColor === c ? 'ring-2 ring-amber-500 ring-offset-2' : 'border-neutral-300'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="mt-2 w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
            >
              Remove text
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
