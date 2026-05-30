import { useState } from 'react';

/* Reusable slider sticker visual. Four modes:
   - 'editor'   — canvas editor in StoryUploader. Static slider, footer
                  reads "Drag to move • Tap to edit" so you know how to
                  reposition / reconfigure.
   - 'preview'  — neutral static rendition (used in the config modal's
                  live preview). No footer, no interaction.
   - 'viewer'   — story recipient view. Slider is interactive; onCommit
                  fires once on release with { value, emoji }.
   - 'response' — chat-preview rendition. Shows the slider at the value
                  that was sent (via `response.value`), with the chosen
                  emoji enlarged.
   The component never decides positioning — the caller wraps it in an
   absolutely-positioned container at the sticker's (x, y). */
export default function SliderSticker({ sticker, mode = 'editor', defaultValue = 50, onCommit, response }) {
  const stages = Array.isArray(sticker.emoji_stages) ? sticker.emoji_stages.filter(Boolean) : [];
  const startLabel = (sticker.start_label || '').trim();
  const endLabel   = (sticker.end_label   || '').trim();
  const prompt     = (sticker.prompt      || '').trim();

  const responseValue = response?.value;
  const responseEmoji = response?.emoji;
  const [value, setValue] = useState(
    typeof responseValue === 'number' ? responseValue : (sticker.default_value ?? defaultValue),
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

  // Response mode pins the slider to whatever the recipient chose; otherwise
  // the handle emoji follows the live `value` (in viewer mode this is the
  // value the recipient is dragging towards).
  const handleEmoji = mode === 'response'
    ? (responseEmoji ?? pickEmoji(value))
    : pickEmoji(value);
  const interactive = mode === 'viewer' && !committed;

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
          <div className="flex items-center justify-between px-1 text-base">
            <span className="line-clamp-1 max-w-[40%] text-left text-xs font-semibold text-neutral-700">
              {startLabel || (stages[0] ?? '')}
            </span>
            <span className="line-clamp-1 max-w-[40%] text-right text-xs font-semibold text-neutral-700">
              {endLabel || (stages[stages.length - 1] ?? '')}
            </span>
          </div>

          {/* Track — tall enough that the emoji handle has vertical room */}
          <div className={`relative mt-1 flex items-center ${mode === 'response' ? 'h-8' : 'h-14'}`}>
            <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-pink-400 via-amber-400 to-emerald-400" />

            {/* Emoji handle: the selected emoji IS the pip */}
            {handleEmoji && (
              <span
                className="pointer-events-none absolute leading-none drop-shadow-md"
                style={{
                  left: `${value}%`,
                  top: '50%',
                  transform: `translate(-50%, -50%) scale(${committed ? 1.5 : 1})`,
                  fontSize: mode === 'response' ? '1.6rem' : committed ? '3.2rem' : '3rem',
                  transition: 'transform 0.15s ease, font-size 0.15s ease',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                }}
              >
                {handleEmoji}
              </span>
            )}

            {/* Native range input — sits on top for interaction, fully transparent */}
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
                className="absolute inset-x-0 inset-y-0 m-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
                style={{ zIndex: 10 }}
                aria-label={prompt || 'Slider response'}
              />
            )}
          </div>
        </div>

        {mode === 'editor' && (
          <p className="mt-2 text-center text-[10px] text-neutral-400">Drag to move • Tap to edit</p>
        )}
        {(committed && mode === 'viewer') && (
          <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            Sent
          </p>
        )}
      </div>
    </div>
  );
}
