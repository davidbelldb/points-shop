/* Shared "story circle" UI — a round image/video thumbnail surrounded by
   a glowing gradient ring (or a flat grey ring when 'glow' is false).
   Used by both the home page strip and the Sneaky Feed page. */
export default function StoryRing({
  thumbnailUrl,
  mediaType,
  glow = true,
  label,
  sublabel,
  onClick,
  plus = false,
  size = 64,
}) {
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 flex-col items-center gap-1 focus:outline-none"
      style={{ width: size }}
      aria-label={label}
    >
      <span
        className={`flex items-center justify-center rounded-full p-[2.5px] ${
          glow
            ? 'bg-gradient-to-tr from-pink-500 via-amber-500 to-emerald-400'
            : 'bg-neutral-300'
        }`}
        style={{ width: size, height: size }}
      >
        <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white">
          {plus ? (
            <span className="flex h-full w-full items-center justify-center bg-amber-500 text-white">
              <svg width={Math.round(size * 0.34)} height={Math.round(size * 0.34)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
          ) : mediaType === 'video' ? (
            <video src={thumbnailUrl} className="h-full w-full object-cover" muted preload="metadata" playsInline />
          ) : mediaType === 'audio' ? (
            <span className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-pink-500 via-amber-500 to-emerald-400 text-white">
              <svg width={Math.round(size * 0.45)} height={Math.round(size * 0.45)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="8" y1="22" x2="16" y2="22" />
              </svg>
            </span>
          ) : (
            <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
          )}
        </span>
      </span>
      {label && (
        <span className="line-clamp-1 max-w-[80px] text-[10px] font-medium text-neutral-700">
          {label}
        </span>
      )}
      {sublabel && (
        <span className="line-clamp-1 max-w-[80px] text-[9px] text-neutral-400">{sublabel}</span>
      )}
    </button>
  );
}
