import { useState } from 'react';
import { assetUrl } from './scrollAssets.js';

/* Fixed branch sprite anchored to one screen edge, level across both layers.
   The send branch (left) and landing branch (right) sit at the same vertical
   anchor so the crow's perch heights match. Placeholder bar until art lands. */
export default function ScrollBranch({ file, side = 'left', anchorY = 58, zIndex = 55 }) {
  const [broken, setBroken] = useState(false);
  const url = assetUrl(file);
  const base = {
    position: 'fixed',
    top: `${anchorY}%`,
    [side]: 0,
    transform: 'translateY(-50%)',
    width: '22.5vmin',
    maxWidth: 165,
    pointerEvents: 'none',
    zIndex,
  };
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setBroken(true)}
        style={{ ...base, transform: `translateY(-50%) ${side === 'right' ? 'scaleX(-1)' : ''}` }}
        draggable={false}
      />
    );
  }
  // Placeholder: a simple angled branch so positioning is visible pre-art.
  return (
    <div style={{ ...base, height: '8vmin' }} aria-hidden>
      <div
        style={{
          position: 'absolute',
          top: '40%',
          [side]: 0,
          width: '100%',
          height: '14px',
          borderRadius: 8,
          background: 'linear-gradient(90deg, #5b3a1a, #3f2710)',
          transform: side === 'right' ? 'rotate(4deg)' : 'rotate(-4deg)',
          boxShadow: '0 3px 6px rgba(0,0,0,0.35)',
        }}
      />
    </div>
  );
}
