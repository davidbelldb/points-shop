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

const IS_TOUCH =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

// ─── SVG arrow icons ──────────────────────────────────────────────────────────

function ArrowUp()    { return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2 L14 12 L2 12 Z"/></svg>; }
function ArrowDown()  { return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 14 L14 4 L2 4 Z"/></svg>; }
function ArrowLeft()  { return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 8 L12 2 L12 14 Z"/></svg>; }
function ArrowRight() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14 8 L4 2 L4 14 Z"/></svg>; }

// ─── Base styles ──────────────────────────────────────────────────────────────

const BASE = {
  pointerEvents:           'auto',
  touchAction:             'none',
  userSelect:              'none',
  WebkitUserSelect:        'none',
  WebkitTapHighlightColor: 'transparent',
  cursor:                  'pointer',
  display:                 'flex',
  alignItems:              'center',
  justifyContent:          'center',
  padding:                 0,
  transition:              'background 0.05s, box-shadow 0.05s, opacity 0.05s, border-color 0.05s',
};

// ─── Individual button ────────────────────────────────────────────────────────

function TBtn({ action, label, style, inputRef, color = 'rgba(255,255,255,0.6)', round = false }) {
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

// ─── D-Pad ────────────────────────────────────────────────────────────────────

function DPad({ inputRef }) {
  const SZ  = 58;
  const GAP = 5;
  const PAD = SZ + GAP;
  const W   = PAD * 3 - GAP;

  return (
    /* outer container — pointer-events: none so the gaps are pass-through */
    <div style={{ position: 'relative', width: W, height: W }}>

      {/* subtle disc backdrop */}
      <div style={{
        position:   'absolute',
        inset:       -8,
        borderRadius: '50%',
        background:  'radial-gradient(circle, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0) 70%)',
        pointerEvents: 'none',
      }} />

      {/* UP */}
      <TBtn action="UP" label={<ArrowUp />} inputRef={inputRef}
        color="rgba(255,255,255,0.65)"
        style={{ position: 'absolute', left: PAD, top: 0, width: SZ, height: SZ, borderBottomLeftRadius: 6, borderBottomRightRadius: 6 }}
      />
      {/* LEFT */}
      <TBtn action="LEFT" label={<ArrowLeft />} inputRef={inputRef}
        color="rgba(255,255,255,0.65)"
        style={{ position: 'absolute', left: 0, top: PAD, width: SZ, height: SZ, borderTopRightRadius: 6, borderBottomRightRadius: 6 }}
      />
      {/* Centre — decorative only */}
      <div style={{
        position:      'absolute',
        left:           PAD,
        top:            PAD,
        width:          SZ,
        height:         SZ,
        background:    'rgba(255,255,255,0.04)',
        border:        '2px solid rgba(255,255,255,0.10)',
        borderRadius:   6,
        pointerEvents: 'none',
      }} />
      {/* RIGHT */}
      <TBtn action="RIGHT" label={<ArrowRight />} inputRef={inputRef}
        color="rgba(255,255,255,0.65)"
        style={{ position: 'absolute', left: PAD * 2, top: PAD, width: SZ, height: SZ, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }}
      />
      {/* DOWN */}
      <TBtn action="DOWN" label={<ArrowDown />} inputRef={inputRef}
        color="rgba(255,255,255,0.65)"
        style={{ position: 'absolute', left: PAD, top: PAD * 2, width: SZ, height: SZ, borderTopLeftRadius: 6, borderTopRightRadius: 6 }}
      />
    </div>
  );
}

// ─── Attack buttons ───────────────────────────────────────────────────────────

// [action, label, neon-colour]
const ATTACK_BTNS = [
  ['JUMP',       'K',   'rgba(96,165,250,1)'],   // blue
  ['BLOCK',      'BLK', 'rgba(250,204,21,1)'],   // yellow
  ['PUNCH',      'J',   'rgba(248,113,113,1)'],   // red
  ['KICK',       'L',   'rgba(251,146,60,1)'],    // orange
  ['POWER_KICK', 'U',   'rgba(167,139,250,1)'],   // purple
  ['COMBO',      'I',   'rgba(52,211,153,1)'],    // green
];

function AttackButtons({ inputRef }) {
  const D = 62;   // circle diameter
  const G = 6;    // gap

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
  const D = 62;
  const G = 6;
  const W = D * 2 + G;

  return (
    <TBtn
      action="PIANO"
      label="◈  SPECIAL"
      color="rgba(251,191,36,1)"
      inputRef={inputRef}
      style={{ width: W, height: 40, fontSize: '0.38rem', letterSpacing: '0.12em', borderRadius: 10 }}
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
        inset:          0,
        pointerEvents: 'none',
        zIndex:         50,
      }}
    >
      {/* D-pad — bottom left */}
      <div style={{
        position:      'absolute',
        left:           14,
        bottom:         18,
        pointerEvents: 'none',
      }}>
        <DPad inputRef={inputRef} />
      </div>

      {/* Attack grid + special — bottom right */}
      <div style={{
        position:      'absolute',
        right:          14,
        bottom:         18,
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
