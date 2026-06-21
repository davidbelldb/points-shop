import { useState } from 'react';
import { assetUrl } from './scrollAssets.js';

/* The landing branch + the perched crow. Both are positioned on the same 0..100
   viewport stage as the flying frames:
     - branch: land_branch_x/y/scale/rotation/opacity (settings)
     - crow:   crow_land_10's own x / y / scale (the final land frame, frozen)
   so the perch sits exactly where the fly-in ends and every field (X, Y, Scale)
   is tunable from the config. Persistent while there's an unread scroll. */
export default function LandingPerch({
  branchFile,
  x = 88,
  y = 58,
  scale = 1,
  rotation = 0,
  opacity = 1,
  baseVmin = 22.5,
  crowFile,
  crowX = 88,
  crowY = 50,
  crowScale = 1,
  crowBaseVmin = 14,
  showCrow = true,
  count = 0,
  onTap,
  zIndex = 35,
}) {
  const branchUrl = assetUrl(branchFile);
  const crowUrl = assetUrl(crowFile);
  const [branchBroke, setBranchBroke] = useState(false);
  const [crowBroke, setCrowBroke] = useState(false);
  const crowSize = crowBaseVmin * (Number(crowScale) || 1);

  const branchStyle = {
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

  return (
    <>
      {/* Branch */}
      {branchUrl && !branchBroke ? (
        <img src={branchUrl} alt="" draggable={false} onError={() => setBranchBroke(true)} style={{ ...branchStyle, display: 'block' }} />
      ) : (
        <div style={{ ...branchStyle, height: '14px', borderRadius: 8, background: 'linear-gradient(90deg, #5b3a1a, #3f2710)', boxShadow: '0 3px 6px rgba(0,0,0,0.35)' }} aria-hidden />
      )}

      {/* Perched crow — crow_land_10 frozen at its config X/Y/Scale */}
      {showCrow && (
        <button
          type="button"
          onClick={onTap}
          title="Read the scroll"
          style={{
            position: 'fixed',
            left: `${crowX}%`,
            top: `${crowY}%`,
            width: `${crowSize}vmin`,
            height: `${crowSize}vmin`,
            transform: 'translate(-50%, -50%)',
            padding: 0, border: 'none', background: 'transparent',
            cursor: 'pointer', pointerEvents: 'auto',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: zIndex + 1,
          }}
        >
          {crowUrl && !crowBroke ? (
            <img src={crowUrl} alt="crow" draggable={false} onError={() => setCrowBroke(true)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: `${crowSize * 0.7}vmin`, lineHeight: 1, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))' }}>🐦‍⬛</span>
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
    </>
  );
}
