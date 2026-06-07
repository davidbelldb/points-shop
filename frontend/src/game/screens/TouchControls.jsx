/**
 * TouchControls
 *
 * On-screen D-pad + attack buttons rendered over the game canvas.
 * Only shown on touch-capable devices.
 *
 * Each button uses pointer-capture so touches that slide off the button
 * are still correctly released.
 *
 * Props:
 *   inputRef — React ref whose .current is the live InputManager instance
 */

import { useState, useCallback } from 'react';

// ─── Touch capability detection (evaluated once) ──────────────────────────────

const IS_TOUCH =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

// ─── Button style helpers ─────────────────────────────────────────────────────

const BASE_BTN = {
  pointerEvents:      'auto',
  touchAction:        'none',
  userSelect:         'none',
  WebkitUserSelect:   'none',
  WebkitTapHighlightColor: 'transparent',
  border:             '2px solid rgba(255,255,255,0.30)',
  borderRadius:       8,
  color:              'rgba(255,255,255,0.85)',
  fontFamily:         'var(--font-pixel)',
  fontSize:           '0.38rem',
  letterSpacing:      '0.05em',
  cursor:             'pointer',
  display:            'flex',
  alignItems:         'center',
  justifyContent:     'center',
  padding:            0,
  transition:         'background 0.06s, opacity 0.06s',
};

function makeBtn(bg = 'rgba(0,0,0,0.40)') {
  return { ...BASE_BTN, background: bg };
}

// ─── Individual button ────────────────────────────────────────────────────────

function TBtn({ action, label, style, inputRef, activeBg = 'rgba(255,255,255,0.28)' }) {
  const [active, setActive] = useState(false);

  const down = useCallback((e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(true);
    inputRef.current?.injectPress(action);
  }, [action, inputRef]);

  const up = useCallback((e) => {
    e.preventDefault();
    setActive(false);
    inputRef.current?.injectRelease(action);
  }, [action, inputRef]);

  return (
    <button
      style={{
        ...makeBtn(active ? activeBg : 'rgba(0,0,0,0.40)'),
        opacity: active ? 1 : 0.72,
        boxShadow: active ? `0 0 12px ${activeBg}` : 'none',
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

// ─── D-Pad ────────────────────────────────────────────────────────────────────

function DPad({ inputRef }) {
  const SZ  = 40;  // button size
  const GAP = 2;
  const PAD = SZ + GAP;  // total cell size

  return (
    <div style={{ position: 'relative', width: PAD * 3 - GAP, height: PAD * 3 - GAP }}>
      {/* UP */}
      <TBtn
        action="UP" label="▲" inputRef={inputRef}
        activeBg="rgba(255,255,255,0.3)"
        style={{ position: 'absolute', left: PAD, top: 0, width: SZ, height: SZ }}
      />
      {/* LEFT */}
      <TBtn
        action="LEFT" label="◄" inputRef={inputRef}
        activeBg="rgba(255,255,255,0.3)"
        style={{ position: 'absolute', left: 0, top: PAD, width: SZ, height: SZ }}
      />
      {/* Centre pip — decorative, no action */}
      <div style={{
        position: 'absolute', left: PAD, top: PAD, width: SZ, height: SZ,
        background: 'rgba(255,255,255,0.06)',
        border: '2px solid rgba(255,255,255,0.14)',
        borderRadius: 8,
        pointerEvents: 'none',
      }} />
      {/* RIGHT */}
      <TBtn
        action="RIGHT" label="►" inputRef={inputRef}
        activeBg="rgba(255,255,255,0.3)"
        style={{ position: 'absolute', left: PAD * 2, top: PAD, width: SZ, height: SZ }}
      />
      {/* DOWN */}
      <TBtn
        action="DOWN" label="▼" inputRef={inputRef}
        activeBg="rgba(255,255,255,0.3)"
        style={{ position: 'absolute', left: PAD, top: PAD * 2, width: SZ, height: SZ }}
      />
    </div>
  );
}

// ─── Attack buttons ───────────────────────────────────────────────────────────

function AttackButtons({ inputRef }) {
  const W = 46;   // button width
  const H = 34;   // button height
  const G = 4;    // gap

  // [action, label, tint-colour]
  const BTNS = [
    ['JUMP',       'K',     'rgba(96,165,250,0.55)'],  // blue
    ['BLOCK',      'BLK',   'rgba(250,204,21,0.55)'],  // yellow
    ['PUNCH',      'J',     'rgba(248,113,113,0.55)'], // red
    ['KICK',       'L',     'rgba(251,146,60,0.55)'],  // orange
    ['POWER_KICK', 'U',     'rgba(167,139,250,0.55)'], // purple
    ['COMBO',      'I',     'rgba(52,211,153,0.55)'],  // green
  ];

  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: `repeat(2, ${W}px)`,
      gridTemplateRows:    `repeat(3, ${H}px)`,
      gap:                 G,
    }}>
      {BTNS.map(([action, label, activeBg]) => (
        <TBtn
          key={action}
          action={action}
          label={label}
          activeBg={activeBg}
          inputRef={inputRef}
          style={{ width: W, height: H }}
        />
      ))}
    </div>
  );
}

function SpecialButton({ inputRef }) {
  return (
    <TBtn
      action="PIANO"
      label="O  SPECIAL"
      activeBg="rgba(251,191,36,0.55)"
      inputRef={inputRef}
      style={{ width: 96 + 4, height: 34 }}
    />
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function TouchControls({ inputRef }) {
  if (!IS_TOUCH) return null;

  return (
    <div
      style={{
        position:      'absolute',
        inset:         0,
        pointerEvents: 'none',
        zIndex:        50,
      }}
    >
      {/* D-pad — bottom left */}
      <div style={{
        position:      'absolute',
        left:          12,
        bottom:        12,
        pointerEvents: 'none',
      }}>
        <DPad inputRef={inputRef} />
      </div>

      {/* Attack grid + special — bottom right */}
      <div style={{
        position:       'absolute',
        right:          12,
        bottom:         12,
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'flex-end',
        gap:            4,
        pointerEvents:  'none',
      }}>
        <SpecialButton inputRef={inputRef} />
        <AttackButtons inputRef={inputRef} />
      </div>
    </div>
  );
}
