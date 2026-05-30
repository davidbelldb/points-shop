/* Bottom-sheet sticker picker for the story canvas editor. Acts as the
   hub for every sticker type — only Slider works today, the rest are
   visible-but-disabled placeholders so the user can see what's coming.
   Adding a new sticker later is one row in the STICKER_TYPES array +
   wiring the callback. */

const STICKER_TYPES = [
  { id: 'slider',  label: 'Slider',       icon: SliderIcon,     enabled: true  },
  { id: 'emoji',   label: 'Emoji',        icon: EmojiIcon,      enabled: false },
  { id: 'text',    label: 'Text Line',    icon: TextIcon,       enabled: true  },
  { id: 'playing', label: 'Now Playing',  icon: NowPlayingIcon, enabled: false },
  { id: 'place',   label: 'Location',     icon: LocationIcon,   enabled: false },
  { id: 'gif',     label: 'GIF',          icon: GifIcon,        enabled: false },
];

function SliderIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function EmojiIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5s1 2 3.5 2 3.5-2 3.5-2" />
      <line x1="9" y1="9.5" x2="9.01" y2="9.5" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="15" y1="9.5" x2="15.01" y2="9.5" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function NowPlayingIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeWidth="1.4" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-6.75-7-11a7 7 0 0 1 14 0c0 4.25-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function GifIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M10 9.5H7.5a2 2 0 0 0 0 4H10v-2" strokeLinecap="round" />
      <line x1="13" y1="9.5" x2="13" y2="13.5" />
      <path d="M16 9.5h2M16 11.5h1.5M16 13.5h2" strokeLinecap="round" />
    </svg>
  );
}

function StickerTile({ entry, badge, onClick }) {
  const { label, icon: Icon, enabled } = entry;
  return (
    <button
      type="button"
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      className={`flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border text-center transition active:scale-95 ${
        enabled
          ? 'border-amber-200 bg-amber-50 text-amber-800 hover:shadow-sm'
          : 'border-neutral-200 bg-neutral-50 text-neutral-300'
      }`}
    >
      <span className="flex items-center justify-center">
        <Icon />
      </span>
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

export default function StickerDrawer({ onClose, onPickSlider, onPickText, hasSlider, textCount = 0 }) {
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
              badge={
                t.id === 'slider' ? (hasSlider ? 'Edit' : null)
                : t.id === 'text' ? (textCount > 0 ? `${textCount} added` : null)
                : null
              }
              onClick={
                t.id === 'slider' ? onPickSlider
                : t.id === 'text' ? onPickText
                : undefined
              }
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
