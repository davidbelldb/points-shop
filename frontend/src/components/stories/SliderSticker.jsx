import { useState } from 'react';

/* Reusable slider sticker visual. Three modes:
   - 'preview' (editor): rendered on the canvas, slider non-interactive
   - 'viewer'  (recipient): slider is draggable; calling code receives the
                            final value + chosen emoji on release
   - 'response' (after submit): a static rendition showing what was sent
   The component never decides positioning — the caller wraps it in an
   absolutely-positioned container at the sticker's (x, y). */
export default function SliderSticker({ sticker, mode = 'preview', defaultValue = 50, onCommit, response }) {
  const stages = Array.isArray(sticker.emoji_stages) ? sticker.emoji_stages.filter(Boolean) : [];
  const startLabel = (sticker.start_label || '').trim();
  const endLabel   = (sticker.end_label   || '').trim();
  const prompt     = (sticker.prompt      || '').trim();

  const [value, setValue] = useState(
    typeof response === 'number' ? response : (sticker.default_value ?? defaultValue),
  );
  const [committed, setCommitted] = useState(mode === 'response');

  function pickEmoji(v) {
    if (stages.length === 0) return null;
    if (stages.length === 1) return stages[0];
    // Buckets evenly across the slider range; last stage extends to 100.
    const per = 100 / stages.length;
    const idx = Math.min(stages.length - 1, Math.floor(v / per));
    return stages[idx];
  }

  const handleEmoji = pickEmoji(value);
  const editorMode = mode === 'preview';
  const viewerMode = mode === 'viewer';
  const interactive = viewerMode && !committed;

  function commit() {
    if (!interactive) return;
    setCommitted(true);
    onCommit?.({ value, emoji: handleEmoji, startLabel, endLabel });
  }

  return (
    <div
      // 220px is a reasonable physical sticker width on a 380px-wide phone.
      // The caller can wrap this in scale() if we ever add per-sticker scaling.
      className="select-none rounded-2xl bg-white/95 shadow-xl ring-1 ring-black/5 backdrop-blur-md"
      style={{ width: 220 }}
    >
      <div className="px-3 pt-2.5 pb-3">
        {prompt && (
          <p className="line-clamp-1 text-center text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            {prompt}
          </p>
        )}

        <div className="relative mt-2">
          {/* Floating handle emoji — given its own height row so it never
              collides with the prompt above. Bottom-anchored so it sits
              right above the track regardless of scale. */}
          {handleEmoji && (
            <div className="relative mb-1 h-7">
              <span
                className="pointer-events-none absolute bottom-0 text-2xl leading-none drop-shadow-md transition-transform"
                style={{
                  left: `${value}%`,
                  transform: `translateX(-50%) scale(${committed ? 1.4 : 1})`,
                }}
              >
                {handleEmoji}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between px-1 text-base">
            <span className="line-clamp-1 max-w-[40%] text-left text-xs font-semibold text-neutral-700">
              {startLabel || (stages[0] ?? '')}
            </span>
            <span className="line-clamp-1 max-w-[40%] text-right text-xs font-semibold text-neutral-700">
              {endLabel || (stages[stages.length - 1] ?? '')}
            </span>
          </div>

          {/* Track */}
          <div className="relative mt-1 h-2 rounded-full bg-gradient-to-r from-pink-400 via-amber-400 to-emerald-400">
            <div
              className="pointer-events-none absolute -top-0.5 h-3 w-3 -translate-x-1/2 rounded-full bg-white shadow ring-1 ring-black/10"
              style={{ left: `${value}%` }}
            />
          </div>

          {/* Native range input handles touch + mouse for free. Hidden
              when not interactive so the canvas / response views are static. */}
          {interactive && (
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              onMouseUp={commit}
              onTouchEnd={commit}
              onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') commit(); }}
              className="absolute inset-x-0 bottom-0 m-0 h-3 w-full cursor-pointer appearance-none bg-transparent opacity-0"
              aria-label={prompt || 'Slider response'}
            />
          )}
        </div>

        {editorMode && (
          <p className="mt-2 text-center text-[10px] text-neutral-400">Drag to move • Tap to edit</p>
        )}
        {committed && mode === 'viewer' && (
          <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            Sent
          </p>
        )}
      </div>
    </div>
  );
}
