/* Bottom-sheet sticker picker for the story canvas editor. Acts as the
   hub for every sticker type — only Slider works today, the rest are
   visible-but-disabled placeholders so the user can see what's coming.
   Adding a new sticker later is one row in the STICKER_TYPES array +
   wiring the callback. */
const STICKER_TYPES = [
  { id: 'slider',  label: 'Slider',      emoji: '🎚️', enabled: true  },
  { id: 'text',    label: 'Text',        emoji: '🅰️', enabled: false },
  { id: 'emoji',   label: 'Emoji',       emoji: '😎', enabled: false },
  { id: 'gif',     label: 'GIF',         emoji: '🎞️', enabled: false },
  { id: 'playing', label: 'Now playing', emoji: '🎧', enabled: false },
  { id: 'place',   label: 'Location',    emoji: '📍', enabled: false },
];

function StickerTile({ entry, badge, onClick }) {
  const { label, emoji, enabled } = entry;
  return (
    <button
      type="button"
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border text-center transition active:scale-95 ${
        enabled
          ? 'border-amber-200 bg-amber-50 text-amber-800 hover:shadow-sm'
          : 'border-neutral-200 bg-neutral-50 text-neutral-300'
      }`}
    >
      <span className="text-3xl leading-none">{emoji}</span>
      <span className={`text-xs font-semibold ${enabled ? '' : 'text-neutral-400'}`}>{label}</span>
      {!enabled && (
        <span className="text-[9px] font-semibold uppercase tracking-wide text-neutral-400">Soon</span>
      )}
      {enabled && badge && (
        <span className="text-[9px] font-semibold uppercase tracking-wide">{badge}</span>
      )}
    </button>
  );
}

export default function StickerDrawer({ onClose, onPickSlider, hasSlider }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <button onClick={onClose} className="text-sm text-neutral-500">Cancel</button>
          <span className="text-sm font-semibold">Add a sticker</span>
          <span className="w-12" />
        </header>

        <div className="grid grid-cols-3 gap-2 p-4">
          {STICKER_TYPES.map((t) => (
            <StickerTile
              key={t.id}
              entry={t}
              badge={t.id === 'slider' ? (hasSlider ? 'Edit' : null) : null}
              onClick={t.id === 'slider' ? onPickSlider : undefined}
            />
          ))}
        </div>

        <p className="px-4 pb-4 text-[11px] text-neutral-400">
          More sticker types coming soon. Tap a sticker on the canvas to edit or remove it.
        </p>
      </div>
    </div>
  );
}
