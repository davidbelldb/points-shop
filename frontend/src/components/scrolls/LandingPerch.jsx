import { useState } from 'react';
import { assetUrl } from './scrollAssets.js';

/* The landing branch with the crow perched ON it. The branch is positioned on
   the 0..100 viewport stage (X/Y) with scale/rotation/opacity; the crow is a
   CHILD of the branch (placed by % of the branch box), so it always sits on the
   branch at any screen size. Persistent while there's an unread scroll. */
export default function LandingPerch({
  branchFile,
  crowFile,
  x = 88,
  y = 58,
  scale = 1,
  rotation = 0,
  opacity = 1,
  showCrow = true,
  count = 0,
  onTap,
  perchX = 50,
  perchBottom = 56,
  perchW = 58,
  baseVmin = 22.5,
  zIndex = 35,
}) {
  const branchUrl = assetUrl(branchFile);
  const crowUrl = assetUrl(crowFile);
  const [branchBroke, setBranchBroke] = useState(false);
  const [crowBroke, setCrowBroke] = useState(false);

  return (
    <div
      style={{
        position: 'fixed', left: `${x}%`, top: `${y}%`,
        transform: `translate(-50%, -50%) scale(${Number(scale) || 1}) rotate(${Number(rotation) || 0}deg)`,
        opacity: opacity == null ? 1 : Number(opacity),
        zIndex, pointerEvents: 'none',
      }}
      aria-hidden={!showCrow}
    >
      <div style={{ position: 'relative', width: `${baseVmin}vmin` }}>
        {branchUrl && !branchBroke ? (
          <img
            src={branchUrl}
            alt=""
            draggable={false}
            onError={() => setBranchBroke(true)}
            style={{ display: 'block', width: '100%' }}
          />
        ) : (
          <div style={{
            height: '14px', borderRadius: 8,
            background: 'linear-gradient(90deg, #5b3a1a, #3f2710)',
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
            {count > 0 && (
              <span
                style={{
                  position: 'absolute', top: '-8%', right: '-8%',
                  minWidth: '5vmin', height: '5vmin', padding: '0 1vmin',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '999px', background: '#dc2626', color: '#fff',
                  fontSize: '3vmin', fontWeight: 700, lineHeight: 1,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                }}
              >
                {count}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
