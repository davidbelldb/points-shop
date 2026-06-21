import { useEffect, useRef, useState } from 'react';
import { assetUrl } from './scrollAssets.js';

/* A single crow frame: its sprite positioned on a 0..100 normalized stage.
   Falls back to a visible placeholder glyph if the sprite file isn't present
   yet, so the animation is fully testable before the real art lands. */
function CrowFrame({ frame, baseSizePct, position = 'fixed', zIndex }) {
  const [broken, setBroken] = useState(false);
  const url = assetUrl(frame.sprite_file);
  // Reset the broken flag whenever the sprite changes, so a single failed frame
  // doesn't fall back to the placeholder for the rest of the sequence.
  useEffect(() => { setBroken(false); }, [url]);
  const size = baseSizePct * (Number(frame.scale) || 1);
  const wrap = {
    position,
    left: `${frame.x}%`,
    top: `${frame.y}%`,
    width: `${size}vmin`,
    height: `${size}vmin`,
    transform: `translate(-50%, -50%) rotate(${Number(frame.rotation) || 0}deg)`,
    opacity: frame.opacity == null ? 1 : Number(frame.opacity),
    zIndex,
    pointerEvents: 'none',
    willChange: 'left, top, transform, opacity',
  };
  if (broken || !url) {
    return (
      <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: `${size * 0.7}vmin`, lineHeight: 1, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))' }}>
          🐦‍⬛
        </span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      onError={() => setBroken(true)}
      style={{ ...wrap, objectFit: 'contain' }}
      draggable={false}
    />
  );
}

/* Config-driven sprite-sequence player on a fixed, full-viewport stage so the
   crow flies "across the screen". Frames come straight from scrolls_config; the
   stage is pointer-transparent except for the optional final-frame tap target.

   props:
     frames       ordered [{sprite_file,x,y,scale,rotation,opacity,duration_ms}]
     fps          global default frame rate (per-frame duration_ms overrides it)
     playing      start/advance the sequence when true
     loop         restart on completion
     perchOnEnd   keep showing the final frame after the sequence ends
     onFinalTap   if set, the perched final frame is tappable (opens scrolls)
     onComplete   called once when the sequence reaches the last frame
     baseSizePct  crow size as vmin (scaled per-frame); default 14
     zIndex       stage z-index
*/
export default function CrowAnimationLayer({
  frames = [],
  fps = 12,
  playing = false,
  loop = false,
  perchOnEnd = false,
  onFinalTap = null,
  onComplete = null,
  baseSizePct = 10.5,
  zIndex = 60,
}) {
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(false);
  const timerRef = useRef(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!playing || frames.length === 0) return undefined;
    setIdx(0);
    setDone(false);
    completedRef.current = false;

    let cancelled = false;
    let i = 0;
    const step = () => {
      if (cancelled) return;
      if (i >= frames.length - 1) {
        if (loop) {
          i = 0;
          setIdx(0);
          timerRef.current = setTimeout(step, frames[0]?.duration_ms || 1000 / fps);
          return;
        }
        if (!completedRef.current) {
          completedRef.current = true;
          setDone(true);
          onComplete?.();
        }
        return;
      }
      i += 1;
      setIdx(i);
      timerRef.current = setTimeout(step, frames[i]?.duration_ms || 1000 / fps);
    };
    timerRef.current = setTimeout(step, frames[0]?.duration_ms || 1000 / fps);
    return () => { cancelled = true; clearTimeout(timerRef.current); };
  }, [playing, loop, fps, frames]);

  if (!playing && !(perchOnEnd && done)) return null;
  if (frames.length === 0) return null;

  const showPerched = perchOnEnd && done;
  const frame = showPerched ? frames[frames.length - 1] : frames[idx];
  const tappable = showPerched && typeof onFinalTap === 'function';

  // Positioned `fixed` (like the branch) so `top: %` resolves against the
  // viewport — an absolute child of a fixed stage doesn't, in Safari.
  if (tappable) {
    return (
      <button
        type="button"
        onClick={onFinalTap}
        title="Read the scroll"
        style={{
          position: 'fixed',
          left: `${frame.x}%`,
          top: `${frame.y}%`,
          width: `${baseSizePct * (Number(frame.scale) || 1) * 1.4}vmin`,
          height: `${baseSizePct * (Number(frame.scale) || 1) * 1.4}vmin`,
          transform: 'translate(-50%, -50%)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          zIndex,
        }}
      >
        <CrowFrame frame={{ ...frame, x: 50, y: 50 }} baseSizePct={baseSizePct} position="absolute" />
      </button>
    );
  }
  return <CrowFrame frame={frame} baseSizePct={baseSizePct} position="fixed" zIndex={zIndex} />;
}
