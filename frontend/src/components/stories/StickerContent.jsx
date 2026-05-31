import TextSticker from './TextSticker.jsx';

/* Visual-only renderer shared by the uploader canvas and the viewer, so every
   sticker type looks identical in editing and playback. Interaction (drag /
   rotate / scale) lives in DraggableSticker; this component is pure output.
   Base px sizes are multiplied by the sticker's `scale` (applied by the
   wrapper's transform), so they read consistently relative to the media box. */
const EMOJI_BASE = 68; // px at scale 1
const GIF_BASE = 180;  // px width at scale 1

function PinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a7 7 0 0 0-7 7c0 4.25 7 13 7 13s7-8.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9 17.5a2.5 2.5 0 1 1-2.5-2.5c.4 0 .77.09 1.1.25V6l9-2v9.5a2.5 2.5 0 1 1-2.5-2.5c.4 0 .77.09 1.1.25V6.2L9 7.7v9.8z" />
    </svg>
  );
}

export default function StickerContent({ sticker }) {
  switch (sticker?.type) {
    case 'text':
      return <TextSticker sticker={sticker} />;

    case 'emoji':
      return (
        <span className="select-none drop-shadow-lg" style={{ fontSize: `${EMOJI_BASE}px`, lineHeight: 1 }}>
          {sticker.emoji}
        </span>
      );

    case 'gif':
      return (
        <img
          src={sticker.url}
          alt=""
          draggable={false}
          className="select-none rounded-xl shadow-lg"
          style={{
            width: `${GIF_BASE}px`,
            height: sticker.aspect ? `${GIF_BASE / sticker.aspect}px` : 'auto',
            display: 'block',
          }}
        />
      );

    case 'location':
      return (
        <span
          className="inline-flex max-w-[80vw] items-center gap-1 rounded-full px-3 py-1 text-sm font-bold shadow-md"
          style={{ backgroundColor: sticker.bgColor || '#ffffff', color: sticker.color || '#111827' }}
        >
          <PinIcon />
          <span className="truncate">{sticker.text || 'Location'}</span>
        </span>
      );

    case 'playing':
      return (
        <span
          className="inline-flex max-w-[80vw] items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold shadow-md"
          style={{ backgroundColor: sticker.bgColor || '#000000', color: sticker.color || '#ffffff' }}
        >
          <NoteIcon />
          <span className="truncate">
            {sticker.title || 'Now playing'}{sticker.artist ? ` · ${sticker.artist}` : ''}
          </span>
        </span>
      );

    default:
      return null;
  }
}
