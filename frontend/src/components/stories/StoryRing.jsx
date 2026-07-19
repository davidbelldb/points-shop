/* Shared "story circle" UI — Instagram-style three-layer ring:
   1. outer gradient (or flat-grey for non-glowing) — the "ring" itself
   2. solid white gap          — creates the breathing room between
                                 the ring and the thumbnail
   3. clipped image / icon     — the actual content
   The default `size` was 64; bumped to 74 (+15%) for the home strip. */
export default function StoryRing({
  thumbnailUrl,
  posterUrl,
  mediaType,
  glow = true,
  label,
  sublabel,
  onClick,
  plus = false,
  size = 74,
}) {
  return (
    <button
      onClick={onClick}
      onContextMenu={(e) => e.preventDefault()}
      className="flex shrink-0 flex-col items-center gap-1 focus:outline-none"
      style={{ width: size }}
      aria-label={label}
    >
      <span
        className={`pointer-events-none relative select-none flex items-center justify-center rounded-full p-[3.5px] ${
          glow ? '' : 'bg-neutral-300'
        }`}
        style={{ width: size, height: size, WebkitTouchCallout: 'none' }}
      >
        {/* Animated "new stories" ring — half solid, half dashed gradient stroke
            that slowly rotates while the dashes march. Only shown when there's
            something unviewed (glow); otherwise the flat grey ring above stands
            in. Sits behind the white gap + thumbnail, showing through the
            3.5px padding band. */}
        {glow && (
          <svg
            viewBox="0 0 100 100"
            fill="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="sneakyStoryRing" gradientUnits="userSpaceOnUse" x1="12" y1="12" x2="88" y2="88">
                <stop offset="0" stopColor="#ec4899" />
                <stop offset="0.5" stopColor="#5fc4b1" />
                <stop offset="1" stopColor="#34d399" />
              </linearGradient>
            </defs>
            <g className="story-ring-spin">
              {/* solid top half */}
              <path
                d="M 4 50 A 46 46 0 0 1 96 50"
                stroke="url(#sneakyStoryRing)"
                strokeWidth="4"
                strokeLinecap="round"
              />
              {/* dashed bottom half — marches via the CSS class */}
              <path
                className="story-ring-march"
                d="M 96 50 A 46 46 0 0 1 4 50"
                stroke="url(#sneakyStoryRing)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="4 7"
              />
            </g>
          </svg>
        )}
        <span className="relative flex h-full w-full items-center justify-center rounded-full bg-white p-[2.5px]">
          <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-neutral-100">
            {plus ? (
              <span className="flex h-full w-full items-center justify-center bg-amber-500 text-white">
                <svg width={Math.round(size * 0.34)} height={Math.round(size * 0.34)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
            ) : mediaType === 'video' ? (
              // Prefer a still poster image (server generates these on upload
              // and backfills legacy rows on first boot). If the parent passes
              // a poster URL we use that; otherwise fall back to a muted
              // <video> with preload=metadata for browsers that decode it.
              posterUrl ? (
                <img
                  src={posterUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  width={size}
                  height={size}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <video src={thumbnailUrl} className="h-full w-full object-cover" muted preload="metadata" playsInline />
              )
            ) : mediaType === 'audio' ? (
              <span className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-pink-500 via-amber-500 to-emerald-400 text-white">
                <svg width={Math.round(size * 0.45)} height={Math.round(size * 0.45)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="8" y1="22" x2="16" y2="22" />
                </svg>
              </span>
            ) : (posterUrl || thumbnailUrl) ? (
              // Prefer the small generated thumbnail (posterUrl) over the
              // full-resolution media_url — circles only render at ~74px,
              // so loading the full image wastes bandwidth and causes the
              // slow "progressive reveal" effect on mobile connections.
              // Falls back to the full image for legacy stories that
              // pre-date the thumbnail backfill.
              <img
                src={posterUrl || thumbnailUrl}
                alt=""
                className="h-full w-full object-cover"
                width={size}
                height={size}
                loading="lazy"
                decoding="async"
              />
            ) : (
              // Silhouette fallback — used when a profile-photo-based ring
              // has no photo set, so the circle still reads as a person.
              <span className="flex h-full w-full items-center justify-center bg-neutral-200 text-neutral-400">
                <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21a8 8 0 0 1 16 0" />
                </svg>
              </span>
            )}
          </span>
        </span>
      </span>
      {label && (
        <span className="line-clamp-1 max-w-[88px] text-[10px] font-medium text-neutral-700">
          {label}
        </span>
      )}
      {sublabel && (
        <span className="line-clamp-1 max-w-[88px] text-[9px] text-neutral-400">{sublabel}</span>
      )}
    </button>
  );
}
