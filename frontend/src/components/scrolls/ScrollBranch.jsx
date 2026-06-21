import { useState } from 'react';
import { assetUrl } from './scrollAssets.js';

/* Branch sprite positioned on the 0..100 viewport stage (like a crow frame),
   with configurable scale, rotation and opacity. Used for the send branch.
   Placeholder bar until art lands. */
export default function ScrollBranch({
  file,
  x = 12,
  y = 58,
  scale = 1,
  rotation = 0,
  opacity = 1,
  baseVmin = 22.5,
  zIndex = 30,
}) {
  const [broken, setBroken] = useState(false);
  const url = assetUrl(file);
  const base = {
    position: 'fixed',
    left: `${x}%`,
    top: `${y}%`,
    width: `${baseVmin}vmin`,
    maxWidth: 165,
    transform: `translate(-50%, -50%) scale(${Number(scale) || 1}) rotate(${Number(rotation) || 0}deg)`,
    opacity: opacity == null ? 1 : Number(opacity),
    pointerEvents: 'none',
    zIndex,
  };
  if (url && !broken) {
    return (
      <img src={url} alt="" onError={() => setBroken(true)} style={{ ...base, display: 'block' }} draggable={false} />
    );
  }
  // Placeholder bar so positioning is visible pre-art.
  return (
    <div style={{ ...base, height: '14px', borderRadius: 8, background: 'linear-gradient(90deg, #5b3a1a, #3f2710)', boxShadow: '0 3px 6px rgba(0,0,0,0.35)' }} aria-hidden />
  );
}
