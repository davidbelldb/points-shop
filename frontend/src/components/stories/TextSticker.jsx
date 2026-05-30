/* Shared renderer for a floating text sticker. Used by the uploader canvas
   (editor preview) and the viewer (final render) so the text looks identical
   in both. Size is a fixed px scale so it reads the same relative to the
   9:16 media box everywhere. */
const TEXT_SIZES = { s: 16, m: 24, l: 38 };

export default function TextSticker({ sticker }) {
  const size = TEXT_SIZES[sticker?.size] ?? TEXT_SIZES.m;
  const color = sticker?.color || '#ffffff';
  const hasBg = !!sticker?.bg;
  return (
    <span
      className="inline-block max-w-[80vw] whitespace-pre-wrap break-words text-center font-bold leading-tight"
      style={{
        fontSize: `${size}px`,
        color,
        textShadow: hasBg ? 'none' : '0 1px 5px rgba(0,0,0,0.65)',
        background: hasBg ? 'rgba(0,0,0,0.45)' : 'transparent',
        padding: hasBg ? '4px 12px' : 0,
        borderRadius: hasBg ? '12px' : 0,
        backdropFilter: hasBg ? 'blur(2px)' : 'none',
        WebkitBackdropFilter: hasBg ? 'blur(2px)' : 'none',
      }}
    >
      {sticker?.text || ' '}
    </span>
  );
}
