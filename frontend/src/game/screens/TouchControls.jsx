/**
 * TouchControls
 *
 * Virtual analogue stick (left) + circular attack buttons (right).
 * Only rendered on touch-capable devices.
 *
 * The analogue stick uses a single pointer-capture zone — slide your thumb
 * anywhere inside the disc to change direction without lifting.
 *
 * Each attack button uses pointer-capture so slides off the button still
 * trigger a clean release.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { hapticTap } from '../../lib/haptics.js';

const IS_TOUCH =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

// ─── Global selection suppression ─────────────────────────────────────────────
// Injected once into <head> so iOS never shows the copy/paste callout
// regardless of hold duration anywhere inside the game overlay.

if (IS_TOUCH && typeof document !== 'undefined') {
  const id = '__tcNoSelect';
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `
      .tc-overlay, .tc-overlay * {
        -webkit-user-select: none !important;
        user-select: none !important;
        -webkit-touch-callout: none !important;
        -webkit-tap-highlight-color: transparent !important;
      }
    `;
    document.head.appendChild(s);
  }
}

// ─── Shared button base ───────────────────────────────────────────────────────

const BASE = {
  pointerEvents:           'auto',
  touchAction:             'none',
  userSelect:              'none',
  WebkitUserSelect:        'none',
  WebkitTouchCallout:      'none',
  WebkitTapHighlightColor: 'transparent',
  cursor:                  'pointer',
  display:                 'flex',
  alignItems:              'center',
  justifyContent:          'center',
  padding:                 0,
  transition:              'background 0.05s, box-shadow 0.05s, opacity 0.05s, border-color 0.05s',
};

// ─── Attack / special button ──────────────────────────────────────────────────

function TBtn({ action, label, style, inputRef, color = 'rgba(255,255,255,0.6)', round = false }) {
  const [active, setActive] = useState(false);

  const down = useCallback((e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(true);
    hapticTap(); // tactile feedback on each on-screen gamepad press
    inputRef.current?.injectPress(action);
  }, [action, inputRef]);

  const up = useCallback((e) => {
    e.preventDefault();
    setActive(false);
    inputRef.current?.injectRelease(action);
  }, [action, inputRef]);

  const idleBorder  = color.replace(/[\d.]+\)$/, '0.35)');
  const activeBorder = color.replace(/[\d.]+\)$/, '0.95)');

  return (
    <button
      style={{
        ...BASE,
        borderRadius:    round ? '50%' : 10,
        border:          `2px solid ${active ? activeBorder : idleBorder}`,
        background:      active
          ? color.replace(/[\d.]+\)$/, '0.28)')
          : 'rgba(6,6,14,0.70)',
        boxShadow:       active
          ? `0 0 14px ${color.replace(/[\d.]+\)$/, '0.60)')}, inset 0 0 8px ${color.replace(/[\d.]+\)$/, '0.15)')}`
          : `0 2px 8px rgba(0,0,0,0.55)`,
        color:           active ? '#fff' : color.replace(/[\d.]+\)$/, '0.80)'),
        opacity:         active ? 1 : 0.80,
        fontFamily:      'var(--font-pixel)',
        fontSize:        '0.40rem',
        letterSpacing:   '0.05em',
        ...style,
      }}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={up}
    >
      {label}
    </button>
  );
}

// ─── Virtual analogue stick ───────────────────────────────────────────────────

const BASE_R  = 66;   // radius of the outer disc
const THUMB_R = 26;   // radius of the inner thumb nub
const DEAD_ZONE = 0.22; // fraction of BASE_R before any direction fires

// Arrow SVGs shown at the 4 compass points inside the disc
function StickArrow({ dir, lit }) {
  const rot = { up: 0, right: 90, down: 180, left: 270 }[dir];
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12"
      fill={lit ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.18)'}
      style={{
        position:   'absolute',
        transition: 'fill 0.05s',
        transform:  `rotate(${rot}deg)`,
        ...({
          up:    { top: 6,  left: '50%', marginLeft: -6 },
          right: { right: 6, top: '50%', marginTop: -6 },
          down:  { bottom: 6, left: '50%', marginLeft: -6 },
          left:  { left: 6,  top: '50%', marginTop: -6 },
        }[dir]),
      }}
    >
      <path d="M6 1 L11 10 L1 10 Z" />
    </svg>
  );
}

function VirtualStick({ inputRef }) {
  const baseRef     = useRef(null);
  const trackingRef = useRef(false);   // avoids stale closure in move handler
  const activeKeys  = useRef(new Set());

  const [thumbPos, setThumbPos] = useState({ x: 0, y: 0 });
  const [isDown,   setIsDown]   = useState(false);
  const [litDirs,  setLitDirs]  = useState({ up: false, right: false, down: false, left: false });

  function pressKey(key) {
    if (!activeKeys.current.has(key)) {
      activeKeys.current.add(key);
      inputRef.current?.injectPress(key);
    }
  }
  function releaseKey(key) {
    if (activeKeys.current.has(key)) {
      activeKeys.current.delete(key);
      inputRef.current?.injectRelease(key);
    }
  }
  function releaseAll() {
    activeKeys.current.forEach(k => inputRef.current?.injectRelease(k));
    activeKeys.current.clear();
  }

  function applyInput(rawDx, rawDy) {
    const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);

    // Clamp thumb visual to disc edge
    const clampedDist = Math.min(dist, BASE_R);
    const angle       = Math.atan2(rawDy, rawDx);
    const tx          = Math.cos(angle) * clampedDist;
    const ty          = Math.sin(angle) * clampedDist;
    setThumbPos({ x: tx, y: ty });

    if (dist < BASE_R * DEAD_ZONE) {
      releaseAll();
      setLitDirs({ up: false, right: false, down: false, left: false });
      return;
    }

    // Convert angle to 4 cardinal directions (with diagonals activating two)
    const deg     = angle * (180 / Math.PI);   // -180..180
    const newUp    = deg > -135 && deg < -45;
    const newDown  = deg >   45 && deg <  135;
    const newLeft  = deg > 135 || deg < -135;
    const newRight = deg >  -45 && deg <   45;

    if (newUp)    pressKey('UP');    else releaseKey('UP');
    if (newDown)  pressKey('DOWN');  else releaseKey('DOWN');
    if (newLeft)  pressKey('LEFT');  else releaseKey('LEFT');
    if (newRight) pressKey('RIGHT'); else releaseKey('RIGHT');

    setLitDirs({ up: newUp, down: newDown, left: newLeft, right: newRight });
  }

  function getOffset(e) {
    const rect = baseRef.current.getBoundingClientRect();
    return {
      dx: e.clientX - (rect.left + rect.width  / 2),
      dy: e.clientY - (rect.top  + rect.height / 2),
    };
  }

  const onPointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    trackingRef.current = true;
    setIsDown(true);
    const { dx, dy } = getOffset(e);
    applyInput(dx, dy);
  };

  const onPointerMove = (e) => {
    if (!trackingRef.current) return;
    e.preventDefault();
    const { dx, dy } = getOffset(e);
    applyInput(dx, dy);
  };

  const onPointerUp = (e) => {
    e.preventDefault();
    trackingRef.current = false;
    setIsDown(false);
    setThumbPos({ x: 0, y: 0 });
    releaseAll();
    setLitDirs({ up: false, right: false, down: false, left: false });
  };

  const D = BASE_R * 2;

  return (
    <div
      ref={baseRef}
      style={{
        position:            'relative',
        width:                D,
        height:               D,
        borderRadius:        '50%',
        background:          'rgba(6,6,14,0.55)',
        border:              `2px solid rgba(255,255,255,${isDown ? 0.22 : 0.10})`,
        boxShadow:           isDown
          ? '0 0 24px rgba(255,255,255,0.06), inset 0 0 20px rgba(0,0,0,0.5)'
          : '0 4px 16px rgba(0,0,0,0.65)',
        pointerEvents:       'auto',
        touchAction:         'none',
        userSelect:          'none',
        WebkitUserSelect:    'none',
        WebkitTouchCallout:  'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Subtle crosshair */}
      <div style={{ position:'absolute', left:'50%', top:12, bottom:12, width:1, background:'rgba(255,255,255,0.05)', transform:'translateX(-50%)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', top:'50%', left:12, right:12, height:1, background:'rgba(255,255,255,0.05)', transform:'translateY(-50%)', pointerEvents:'none' }} />

      {/* Compass arrows */}
      <StickArrow dir="up"    lit={litDirs.up} />
      <StickArrow dir="right" lit={litDirs.right} />
      <StickArrow dir="down"  lit={litDirs.down} />
      <StickArrow dir="left"  lit={litDirs.left} />

      {/* Thumb nub */}
      <div
        style={{
          position:    'absolute',
          left:        '50%',
          top:         '50%',
          width:        THUMB_R * 2,
          height:       THUMB_R * 2,
          borderRadius: '50%',
          background:   isDown ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.09)',
          border:      `2px solid rgba(255,255,255,${isDown ? 0.55 : 0.25})`,
          boxShadow:    isDown ? '0 0 14px rgba(255,255,255,0.25)' : 'none',
          transform:   `translate(calc(-50% + ${thumbPos.x}px), calc(-50% + ${thumbPos.y}px))`,
          transition:   isDown ? 'none' : 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// ─── Attack buttons ───────────────────────────────────────────────────────────

const ATTACK_BTNS = [
  ['JUMP',       'K',   'rgba(96,165,250,1)'],
  ['BLOCK',      'BLK', 'rgba(250,204,21,1)'],
  ['PUNCH',      'J',   'rgba(248,113,113,1)'],
  ['KICK',       'L',   'rgba(251,146,60,1)'],
  ['POWER_KICK', 'U',   'rgba(167,139,250,1)'],
  ['COMBO',      'I',   'rgba(52,211,153,1)'],
];

function AttackButtons({ inputRef }) {
  const D = 62;
  const G = 6;
  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: `repeat(2, ${D}px)`,
      gridTemplateRows:    `repeat(3, ${D}px)`,
      gap:                  G,
    }}>
      {ATTACK_BTNS.map(([action, label, color]) => (
        <TBtn
          key={action}
          action={action}
          label={label}
          color={color}
          inputRef={inputRef}
          round
          style={{ width: D, height: D, fontSize: label.length > 2 ? '0.36rem' : '0.48rem' }}
        />
      ))}
    </div>
  );
}

function SpecialButton({ inputRef }) {
  const D = 62, G = 6;
  return (
    <TBtn
      action="PIANO"
      label="◈  SPECIAL"
      color="rgba(251,191,36,1)"
      inputRef={inputRef}
      style={{ width: D * 2 + G, height: D, fontSize: '0.38rem', letterSpacing: '0.12em', borderRadius: D / 2 }}
    />
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function TouchControls({ inputRef }) {
  if (!IS_TOUCH) return null;

  return (
    <div
      className="tc-overlay"
      style={{
        position:           'absolute',
        inset:               0,
        pointerEvents:      'none',
        zIndex:              50,
        userSelect:         'none',
        WebkitUserSelect:   'none',
        WebkitTouchCallout: 'none',
      }}
    >
      {/* Analogue stick — bottom left */}
      <div style={{ position: 'absolute', left: 16, bottom: 20, pointerEvents: 'none' }}>
        <VirtualStick inputRef={inputRef} />
      </div>

      {/* Attack grid + special — bottom right */}
      <div style={{
        position:      'absolute',
        right:          16,
        bottom:         20,
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'flex-end',
        gap:            6,
        pointerEvents: 'none',
      }}>
        <SpecialButton inputRef={inputRef} />
        <AttackButtons inputRef={inputRef} />
      </div>
    </div>
  );
}
