import { useState } from 'react';
import { assetUrl } from './scrollAssets.js';

/* The landing branch with the crow perched ON it. The crow is positioned
   RELATIVE TO THE BRANCH (not the viewport), so it always sits on the branch
   regardless of screen size or window resizing. Persistent: shown for as long
   as there's an unread scroll. The branch itself is anchored to the screen edge
   at a fixed vertical position.

   perchX / perchBottom / perchW are the crow's placement on the branch as
   percentages of the branch box — tweak to seat the crow's feet on the branch
   once the real crow_land sprites are in. */
export default function LandingPerch({
  branchFile,
  crowFile,
  side = 'right',
  anchorY = 58,
  showCrow = true,
  onTap,
  perchX = 50,
  perchBottom = 56,
  perchW = 58,
  zIndex = 60,
}) {
  const branchUrl = assetUrl(branchFile);
  const crowUrl = assetUrl(crowFile);
  const [branchBroke, setBranchBroke] = useState(false);
  const [crowBroke, setCrowBroke] = useState(false);

  return (
    <div
      style={{
        position: 'fixed', top: `${anchorY}%`, [side]: 0,
        transform: 'translateY(-50%)', zIndex, pointerEvents: 'none',
      }}
      aria-hidden={!showCrow}
    >
      {/* Branch box defines the coordinate space the crow is placed within. */}
      <div style={{ position: 'relative', width: '30vmin', maxWidth: 220 }}>
        {branchUrl && !branchBroke ? (
          <img
            src={branchUrl}
            alt=""
            draggable={false}
            onError={() => setBranchBroke(true)}
            style={{ display: 'block', width: '100%', transform: side === 'right' ? 'scaleX(-1)' : 'none' }}
          />
        ) : (
          <div style={{
            height: '14px', borderRadius: 8,
            background: 'linear-gradient(90deg, #5b3a1a, #3f2710)',
            transform: side === 'right' ? 'rotate(4deg)' : 'rotate(-4deg)',
            boxShadow: '0 3px 6px rgba(0,0,0,0.35)',
          }} />
        )}

        {showCrow && (
          <button
            type="button"
            onClick={onTap}
            title="Read the scroll"
            style={{
              position: 'absolute',
              left: `${perchX}%`,
              bottom: `${perchBottom}%`,
              width: `${perchW}%`,
              transform: 'translateX(-50%)',
              padding: 0, border: 'none', background: 'transparent',
              cursor: 'pointer', pointerEvents: 'auto',
              animation: 'scroll-perch-bob-x 1.8s ease-in-out infinite',
            }}
          >
            {crowUrl && !crowBroke ? (
              <img
                src={crowUrl}
                alt="crow"
                draggable={false}
                onError={() => setCrowBroke(true)}
                style={{ display: 'block', width: '100%' }}
              />
            ) : (
              <span style={{ fontSize: '6vmin', lineHeight: 1, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))' }}>🐦‍⬛</span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
