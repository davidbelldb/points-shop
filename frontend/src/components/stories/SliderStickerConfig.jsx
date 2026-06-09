import { useState } from 'react';
import SliderSticker from './SliderSticker.jsx';

/* Bottom-sheet modal that walks the poster through the slider sticker
   settings: prompt, the two endpoint labels (text OR emoji), and an
   optional emoji-stage progression (the morphing handle emoji). The
   user gets a live preview at the top of the sheet so they can see the
   slider exactly as recipients will. */
const EMPTY = {
  prompt: '',
  start_label: '',
  end_label: '',
  emoji_stages: ['💩', '🤡', '😎', '😍'],
};

export default function SliderStickerConfig({ initial, onCancel, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => ({ ...EMPTY, ...(initial ?? {}) }));
  const [stagesText, setStagesText] = useState(() => (initial?.emoji_stages ?? EMPTY.emoji_stages).join(' '));

  // Stages come in as a space-separated string from the textarea, and we
  // split on whitespace + filter out empties so paste with newlines / tabs
  // also works.
  function applyStagesText(text) {
    setStagesText(text);
    const stages = String(text).split(/\s+/).map((s) => s.trim()).filter(Boolean).slice(0, 8);
    setDraft((d) => ({ ...d, emoji_stages: stages }));
  }

  const previewSticker = {
    ...draft,
    prompt: draft.prompt || 'How was it?',
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <button onClick={onCancel} className="text-sm text-neutral-500">Cancel</button>
          <span className="text-sm font-semibold">Slider sticker</span>
          <button
            onClick={() => onSave(draft)}
            className="text-sm font-semibold text-amber-700"
          >
            Save
          </button>
        </header>

        <div className="max-h-[72vh] space-y-4 overflow-y-auto p-4">
          {/* Live preview — uses the same component the canvas / viewer will. */}
          <div className="rounded-2xl bg-neutral-100 p-4">
            <div className="mx-auto" style={{ width: 220 }}>
              <SliderSticker sticker={previewSticker} mode="preview" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-500">Prompt (optional)</label>
            <input
              value={draft.prompt}
              onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
              maxLength={40}
              placeholder="e.g. How grippy?"
              className="mt-1 block w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-neutral-500">Left label</label>
              <input
                value={draft.start_label}
                onChange={(e) => setDraft((d) => ({ ...d, start_label: e.target.value }))}
                maxLength={20}
                placeholder="slippy"
                className="mt-1 block w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-500">Right label</label>
              <input
                value={draft.end_label}
                onChange={(e) => setDraft((d) => ({ ...d, end_label: e.target.value }))}
                maxLength={20}
                placeholder="grippy"
                className="mt-1 block w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-500">
              Handle emoji progression
            </label>
            <input
              value={stagesText}
              onChange={(e) => applyStagesText(e.target.value)}
              placeholder="💩 🤡 😎 😍"
              className="mt-1 block w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-base focus:border-amber-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-neutral-400">
              Up to 8 emojis, separated by spaces. The handle morphs through them as the slider moves.
            </p>
          </div>

          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="mt-2 w-full rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
            >
              Remove slider
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
