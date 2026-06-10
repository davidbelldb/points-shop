/**
 * GameScreen
 *
 * Wires together the full game loop:
 *   Player input → Enemy AI (1P) / Player2 (2P) → Combat → RoundManager → Render
 *
 * React handles the HUD (HP bars, score pips, round counter, combo display, overlays).
 * The canvas handles the scene.
 *
 * Props:
 *   audio      — shared AudioManager from GameContainer
 *   twoPlayer  — if true, enemy slot is a second human Player driven by gamepad 1
 *   difficulty — '1p' difficulty; ignored in 2P mode
 */

import { useEffect, useRef, useState } from 'react';
import { useGamepadMenu } from '../hooks/useGamepadMenu.js';
import { GameLoop }        from '../engine/GameLoop.js';
import { InputManager }    from '../engine/InputManager.js';
import { GamepadManager }  from '../engine/GamepadManager.js';
import { CombatSystem }    from '../engine/CombatSystem.js';
import { RoundManager }    from '../engine/RoundManager.js';
import { Player }          from '../entities/Player.js';
import { Enemy }           from '../entities/Enemy.js';
import { Renderer }        from '../renderer/Renderer.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants.js';
import TouchControls       from './TouchControls.jsx';
import { api }             from '../../lib/api.js';

// Points per difficulty for beating the CPU
const WIN_PTS = { easy: 4, medium: 8, hard: 12 };

// Slow-motion factor applied on finishing blow (0 = full speed, lasts SLOMO_DURATION s)
const SLOMO_FACTOR   = 0.15;
const SLOMO_DURATION = 0.9;

const IS_TOUCH =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

// Frozen input: all queries return false — used during countdown / round-end
const FROZEN_INPUT = { isHeld: () => false, isPressed: () => false, isReleased: () => false };

// ─── HUD sub-components ───────────────────────────────────────────────────────

function hpColor(pct) {
  if (pct > 0.5) return '#4ade80';
  if (pct > 0.25) return '#fbbf24';
  return '#ef4444';
}

function HealthBar({ name, hp, maxHp, align = 'left' }) {
  const pct   = Math.max(0, hp / maxHp);
  const color = hpColor(pct);
  return (
    <div className={`flex flex-col gap-0.5 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      <span className="select-none" style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.45rem', letterSpacing: '0.15em', color: '#ffffffcc', textShadow: '0 0 6px #000' }}>
        {name}
      </span>
      <div className="relative overflow-hidden" style={{ width: 260, height: 18, background: '#111', border: '2px solid #ffffff44', boxShadow: 'inset 0 1px 4px #000' }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left:  align === 'left'  ? 0 : 'auto',
          right: align === 'right' ? 0 : 'auto',
          width: `${pct * 100}%`, background: color,
          boxShadow: `0 0 8px ${color}88`, transition: 'width 0.1s linear, background 0.3s',
        }} />
      </div>
    </div>
  );
}

function WinPips({ wins, align = 'left' }) {
  return (
    <div className={`flex gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {[0, 1].map(i => (
        <div key={i} style={{ width: 10, height: 10, background: i < wins ? '#fbbf24' : 'transparent', border: '2px solid #fbbf2488', boxShadow: i < wins ? '0 0 6px #fbbf24' : 'none' }} />
      ))}
    </div>
  );
}

function ComboDisplay({ count, align = 'left' }) {
  if (count < 2) return null;
  const scale = Math.min(1.1, 0.65 + count * 0.05);
  const color = align === 'left' ? '#fbbf24' : '#f87171';
  return (
    <div style={{ position: 'absolute', [align]: 12, bottom: 72, fontFamily: 'var(--font-pixel)', fontSize: `${scale}rem`, color, textShadow: `0 0 18px ${color}, 2px 2px 0 #000`, letterSpacing: '0.05em', textAlign: align === 'right' ? 'right' : 'left', pointerEvents: 'none', zIndex: 15, animation: 'comboFade 0.18s ease-out' }}>
      {count} HIT{count >= 5 ? ' COMBO!' : ''}
    </div>
  );
}

function HUD({ playerHp, enemyHp, maxHp, scores, round, playerCombo, enemyCombo, onPause, paused, p1Name = 'KATIE', p2Name = 'DAVID' }) {
  return (
    <>
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between px-3 pt-2 select-none" style={{ zIndex: 10, pointerEvents: 'none' }}>
        <div className="flex flex-col gap-1">
          <HealthBar name={p1Name} hp={playerHp} maxHp={maxHp} align="left" />
          <WinPips wins={scores.player} align="left" />
        </div>

        {/* Round counter + touch pause */}
        <div className="flex flex-col items-center gap-1 pt-1" style={{ fontFamily: 'var(--font-pixel)', color: '#ffffff99' }}>
          <span style={{ fontSize: '0.45rem', letterSpacing: '0.2em' }}>ROUND</span>
          <span style={{ fontSize: '1.2rem', color: '#fff', textShadow: '0 0 10px #fff8' }}>{round}</span>
          {IS_TOUCH && (
            <button
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onPause?.(); }}
              style={{ pointerEvents: 'auto', touchAction: 'none', WebkitTouchCallout: 'none', WebkitTapHighlightColor: 'transparent', marginTop: 4, width: 34, height: 34, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.28)', background: paused ? 'rgba(255,255,255,0.14)' : 'rgba(6,6,14,0.60)', color: 'rgba(255,255,255,0.70)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
            >
              {paused
                ? <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 2 L9 6 L2 10 Z"/></svg>
                : <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="3" height="8" rx="1"/><rect x="6" y="1" width="3" height="8" rx="1"/></svg>
              }
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1 items-end">
          <HealthBar name={p2Name} hp={enemyHp} maxHp={maxHp} align="right" />
          <WinPips wins={scores.enemy} align="right" />
        </div>
      </div>

      <ComboDisplay count={playerCombo} align="left"  />
      <ComboDisplay count={enemyCombo}  align="right" />
      <style>{`@keyframes comboFade { from { opacity:0; transform:scale(1.3) } to { opacity:1; transform:scale(1) } }`}</style>
    </>
  );
}

function Overlay({ text, style: overlayStyle }) {
  if (!text) return null;
  const isFight  = overlayStyle === 'fight';
  const isNumber = overlayStyle === 'number';
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" style={{ zIndex: 20 }}>
      <span style={{ fontFamily: 'var(--font-pixel)', fontSize: isFight ? '2.8rem' : isNumber ? '4.5rem' : '2rem', color: isFight ? '#fbbf24' : '#ffffff', textShadow: isFight ? '0 0 30px #fbbf24, 0 0 60px #f59e0b, 3px 3px 0 #000' : '3px 3px 0 #000, 0 0 20px #fff4', letterSpacing: '0.05em' }}>
        {text}
      </span>
    </div>
  );
}

function MatchOver({ winner, pts, onRematch, onQuit, p1Name = 'KATIE', p2Name = 'DAVID' }) {
  const [sel, setSel] = useState(0);
  const selRef = useRef(0);

  const doConfirm = () => { if (selRef.current === 0) onRematch(); else onQuit(); };

  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'ArrowLeft'  || e.code === 'ArrowUp'   || e.code === 'KeyA') { selRef.current = 0; setSel(0); }
      if (e.code === 'ArrowRight' || e.code === 'ArrowDown'  || e.code === 'KeyD') { selRef.current = 1; setSel(1); }
      if (e.code === 'Enter') doConfirm();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onRematch, onQuit]);

  useGamepadMenu({
    onLeft:    () => { selRef.current = 0; setSel(0); },
    onRight:   () => { selRef.current = 1; setSel(1); },
    onUp:      () => { selRef.current = 0; setSel(0); },
    onDown:    () => { selRef.current = 1; setSel(1); },
    onConfirm: doConfirm,
  });

  const btnStyle = (active) => ({
    fontSize: '0.55rem', letterSpacing: '0.15em', cursor: 'pointer', transition: 'all 0.1s', padding: '8px 24px',
    border:     active ? '2px solid rgba(255,255,255,0.80)' : '2px solid rgba(255,255,255,0.20)',
    color:      active ? '#fff' : 'rgba(255,255,255,0.4)',
    background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
    textShadow: active ? '0 0 10px #fff8' : 'none',
  });

  const winnerName = winner === 'player' ? `${p1Name} WINS!` : `${p2Name} WINS!`;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 pointer-events-auto select-none" style={{ background: 'rgba(0,0,0,0.75)', zIndex: 30, fontFamily: 'var(--font-pixel)' }}>
      <p style={{ fontSize: '1.4rem', letterSpacing: '0.1em', color: '#fbbf24', textShadow: '0 0 30px #fbbf24' }}>
        {winnerName}
      </p>
      {/* Points earned — only shown when player (Katie) beats the CPU */}
      {pts != null && pts > 0 && (
        <p style={{ fontSize: '0.75rem', letterSpacing: '0.15em', color: '#fbbf24', textShadow: '0 0 16px #fbbf24aa', marginTop: -12 }}>
          + {pts} PTS
        </p>
      )}
      <div className="flex gap-6">
        <button onClick={onRematch} style={btnStyle(sel === 0)}>REMATCH</button>
        <button onClick={onQuit}    style={btnStyle(sel === 1)}>QUIT</button>
      </div>
      <p style={{ fontSize: '0.4rem', letterSpacing: '0.15em', color: '#ffffff33' }}>
        ←/→ · D-PAD SELECT &nbsp;·&nbsp; ENTER · A CONFIRM
      </p>
    </div>
  );
}

function PauseOverlay({ onResume, onQuit }) {
  const [sel, setSel] = useState(0);
  const selRef = useRef(0);

  const doConfirm = () => { if (selRef.current === 0) onResume(); else onQuit(); };

  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'ArrowLeft'  || e.code === 'ArrowUp'   || e.code === 'KeyA') { selRef.current = 0; setSel(0); }
      if (e.code === 'ArrowRight' || e.code === 'ArrowDown'  || e.code === 'KeyD') { selRef.current = 1; setSel(1); }
      if (e.code === 'Enter') doConfirm();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onResume, onQuit]);

  useGamepadMenu({
    onLeft:    () => { selRef.current = 0; setSel(0); },
    onRight:   () => { selRef.current = 1; setSel(1); },
    onUp:      () => { selRef.current = 0; setSel(0); },
    onDown:    () => { selRef.current = 1; setSel(1); },
    onConfirm: doConfirm,
    onStart:   onResume,   // Start always resumes
  });

  const btnStyle = (active) => ({
    fontSize: '0.55rem', letterSpacing: '0.15em', cursor: 'pointer', transition: 'all 0.1s', padding: '8px 24px',
    border:     active ? '2px solid rgba(255,255,255,0.80)' : '2px solid rgba(255,255,255,0.20)',
    color:      active ? '#fff' : 'rgba(255,255,255,0.4)',
    background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
    textShadow: active ? '0 0 10px #fff8' : 'none',
  });

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 pointer-events-auto select-none" style={{ background: 'rgba(0,0,0,0.70)', zIndex: 40, fontFamily: 'var(--font-pixel)' }}>
      <p style={{ fontSize: '1.8rem', letterSpacing: '0.3em', color: '#fff', textShadow: '0 0 20px #fff6' }}>PAUSED</p>
      <div className="flex gap-6">
        <button onClick={onResume} style={btnStyle(sel === 0)}>RESUME</button>
        <button onClick={onQuit}   style={btnStyle(sel === 1)}>QUIT</button>
      </div>
      <p style={{ fontSize: '0.4rem', letterSpacing: '0.15em', color: '#ffffff33' }}>
        ←/→ · D-PAD SELECT &nbsp;·&nbsp; ENTER · A CONFIRM &nbsp;·&nbsp; ESC · START RESUME
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GameScreen({ sprites, character, level, difficulty = 'easy', audio, twoPlayer = false, p2Character = null, net = null, netRole = null, onQuit, onRematch }) {
  const canvasRef  = useRef(null);
  const inputRef   = useRef(null);   // P1 — exposed to TouchControls + GamepadManager 0
  const inputRef2  = useRef(null);   // P2 — GamepadManager 1 (local 2P) or network (online host)
  const pausedRef  = useRef(false);
  const slowMoRef  = useRef(0);      // seconds remaining in slow-motion
  const matchIdRef = useRef(null);   // per-match UUID for points idempotency

  // ── Character slots ─────────────────────────────────────────────────────────
  // P1 = `character` (host's pick online); P2 = `p2Character` or the mirror.
  // Mirror matches get a " 2" suffix so the HUD stays readable.
  const p1CharId = character ?? 'katie';
  const p2CharId = p2Character ?? (p1CharId === 'katie' ? 'david' : 'katie');
  const p1Name   = p1CharId.toUpperCase();
  const p2Name   = p1CharId === p2CharId ? `${p2CharId.toUpperCase()} 2` : p2CharId.toUpperCase();

  // ── Online netplay (host-authoritative) ─────────────────────────────────────
  const isOnline = !!net;
  const isHost   = isOnline && netRole === 'host';
  const isGuest  = isOnline && netRole === 'guest';
  const [oppLeft, setOppLeft] = useState(false);
  const guestMidRef    = useRef(null);   // host's matchId, carried in snapshots
  const onlineClaimRef = useRef(false);  // win points claimed once per match

  // Latest container callbacks for use inside net.onMessage (avoids stale closures)
  const onRematchRef = useRef(onRematch);
  const onQuitRef    = useRef(onQuit);
  onRematchRef.current = onRematch;
  onQuitRef.current    = onQuit;

  if (!matchIdRef.current) {
    matchIdRef.current = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 18));
  }

  const [paused,   setPaused]   = useState(false);
  const [ptsEarned, setPtsEarned] = useState(null);  // null = not yet determined
  const [hudState, setHudState] = useState({
    playerHp: 100, enemyHp: 100, maxHp: 100,
    scores: { player: 0, enemy: 0 },
    round: 1,
    overlay: { text: '3', style: 'number' },
    matchOver: false, winner: null,
    playerCombo: 0, enemyCombo: 0,
  });

  // Toggle pause helper — shared by ESC key, touch button, and gamepad Start.
  // Guests can't pause — the host owns the simulation (they see the host's
  // PAUSED state via snapshots instead).
  const togglePause = () => {
    if (isGuest) return;
    pausedRef.current = !pausedRef.current;
    setPaused(p => !p);
  };

  // Online rematch/quit coordination
  const doRematch = () => {
    if (isHost)       { net.send({ t: 'rematch' }); onRematch(); }
    else if (isGuest) { net.send({ t: 'rematchreq' }); }  // host confirms with 'rematch'
    else onRematch();
  };
  const doQuit = () => {
    if (isOnline) net.send({ t: 'quit' });
    onQuit();
  };

  // ESC → pause (keyboard, 1P only)
  useEffect(() => {
    const onEsc = (e) => { if (e.code === 'Escape') togglePause(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  // Award points when player (Katie) wins vs CPU — runs once when matchOver+winner known
  useEffect(() => {
    if (twoPlayer) return;                               // no points in PvP
    if (!hudState.matchOver) return;
    if (hudState.winner !== 'player') {
      setPtsEarned(0);                                   // Katie lost — show 0 (nothing)
      return;
    }
    if (ptsEarned !== null) return;                      // already called

    api.cambsRageWin(difficulty, matchIdRef.current)
      .then(({ pts }) => setPtsEarned(pts))
      .catch(() => setPtsEarned(WIN_PTS[difficulty] ?? 4)); // optimistic fallback
  }, [hudState.matchOver, hudState.winner]);

  // Online PvP: the WINNER claims their points (idempotent server-side).
  // Host wins as 'player' (P1 slot), guest wins as 'enemy' (P2 slot).
  const iWonOnline = isOnline && hudState.matchOver &&
    (isHost ? hudState.winner === 'player' : hudState.winner === 'enemy');

  useEffect(() => {
    if (!iWonOnline || onlineClaimRef.current) return;
    const mid = isHost ? matchIdRef.current : guestMidRef.current;
    if (!mid) return;
    onlineClaimRef.current = true;
    api.crOnlineWin(mid)
      .then(({ pts }) => setPtsEarned(pts))
      .catch(() => setPtsEarned(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iWonOnline]);

  // Game loop — runs once per mount (sprites ref is stable)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sprites) return;

    // ── ONLINE GUEST — render-only client ────────────────────────────────────
    // Sends our held inputs every frame, renders the host's snapshots.
    // No simulation runs here: the host is authoritative over everything.
    if (isGuest) {
      const input = new InputManager().attach(window);
      inputRef.current = input;
      const gpad1 = new GamepadManager(0, inputRef, { onPause: () => {} });

      const player = new Player({ x: 200, z: 30, characterId: p1CharId });
      const enemy  = new Player({ x: 620, z: 30, characterId: p2CharId, facingLeft: true });
      const renderer = new Renderer(canvas, sprites);

      let snap = null;
      let musicStarted = false;
      let frameCount = 0;

      net.onMessage = (m) => {
        if (m.t === 's') {
          snap = m;
          if (m.mid) guestMidRef.current = m.mid;
        }
        else if (m.t === 'rematch') onRematchRef.current?.();
        else if (m.t === 'quit') setOppLeft(true);
      };
      net.onClose = () => setOppLeft(true);

      const applyF = (ent, a) => {
        ent.x = a[0]; ent.z = a[1]; ent.jumpY = a[2];
        ent.facingLeft = !!a[3]; ent.hurt = !!a[4];
        ent.anim.animName = a[5]; ent.anim.frameIndex = a[6];
      };

      const loop = new GameLoop({
        update() {
          gpad1.poll();
          // We're the DAVID slot — ship the full held-action set; the host
          // derives press/release edges by diffing successive sets.
          net.send({ t: 'i', h: input.heldActions() });
          input.consumeFrame();

          if (snap) {
            applyF(player, snap.p);
            applyF(enemy,  snap.e);
            if (!musicStarted && snap.hud.ot === 'FIGHT!') { audio?.startBattleMusic(); musicStarted = true; }
            if (snap.hud.over && musicStarted) { audio?.stopBattleMusic(); musicStarted = false; }
          }
        },
        render(dt) {
          renderer.draw({ player, entities: [enemy], background: sprites.get(level?.bgKey ?? 'bg_01') }, dt);
          frameCount++;
          if (snap && frameCount % 3 === 0) {
            setHudState({
              playerHp: snap.hud.ph, enemyHp: snap.hud.eh, maxHp: player.maxHp,
              scores: { player: snap.hud.sp, enemy: snap.hud.se },
              round: snap.hud.rd,
              overlay: snap.paused
                ? { text: 'PAUSED', style: 'ko' }
                : (snap.hud.ot ? { text: snap.hud.ot, style: snap.hud.os } : null),
              matchOver: snap.hud.over, winner: snap.hud.win,
              playerCombo: snap.hud.pc, enemyCombo: snap.hud.ec,
            });
          }
        },
      });

      loop.start();
      return () => {
        loop.stop();
        input.detach();
        inputRef.current = null;
        gpad1.reset();
        net.onMessage = null;
        audio?.stopBattleMusic();
      };
    }

    // P1 input
    const input = new InputManager().attach(window);
    inputRef.current = input;

    // Entities
    const player = new Player({ x: 200, z: 30, characterId: p1CharId });

    // In 2P mode: second Player instead of Enemy AI; starts on right, facing left
    let enemy;
    let input2 = null;
    if (twoPlayer) {
      input2 = new InputManager();   // no keyboard attach — driven by gamepad 1 or the network
      inputRef2.current = input2;
      enemy = new Player({ x: 620, z: 30, characterId: p2CharId, facingLeft: true });
    } else {
      enemy = new Enemy({ x: 620, z: 30, characterId: p2CharId, difficulty });
    }

    // Gamepad managers — poll inside the game loop update each frame.
    // Online host: P2 is remote, so no second local gamepad.
    const gpad1 = new GamepadManager(0, inputRef,  { onPause: togglePause });
    const gpad2 = twoPlayer && !isHost ? new GamepadManager(1, inputRef2, { onPause: togglePause }) : null;

    const renderer = new Renderer(canvas, sprites);
    const combat   = new CombatSystem();
    const rounds   = new RoundManager({ p1Name, p2Name });

    // ── ONLINE HOST — guest inputs arrive over the DataChannel ───────────────
    // The guest ships its full held-action set every frame; we diff against
    // the previous set to produce the press/release edges P2's InputManager
    // expects, then the sim runs exactly like local 2P.
    let prevHeld = new Set();
    if (isHost) {
      net.onMessage = (m) => {
        if (m.t === 'i' && input2) {
          const held = new Set(m.h ?? []);
          for (const a of held)     if (!prevHeld.has(a)) input2.injectPress(a);
          for (const a of prevHeld) if (!held.has(a))     input2.injectRelease(a);
          prevHeld = held;
        } else if (m.t === 'rematchreq') {
          net.send({ t: 'rematch' });
          onRematchRef.current?.();
        } else if (m.t === 'quit') {
          setOppLeft(true);
          pausedRef.current = true;
        }
      };
      net.onClose = () => { setOppLeft(true); pausedRef.current = true; };
    }

    combat.onAudio = (type) => audio?.play(type);
    combat.onShake = (intensity, dur) => renderer.triggerShake(intensity, dur);
    // Killing blow → slow-motion
    combat.onKO = () => { slowMoRef.current = SLOMO_DURATION; };

    let frameCount   = 0;
    let matchDone    = false;
    let musicStarted = false;

    const loop = new GameLoop({
      update(dt) {
        // Poll gamepads first so injected inputs are ready for this tick
        gpad1.poll();
        gpad2?.poll();

        if (pausedRef.current) return;
        // After match ends, keep updating entities until slow-mo finishes
        // so the finishing-blow animation plays at reduced speed.
        if (matchDone && slowMoRef.current <= 0) return;

        // Slow-motion: scale dt when a KO just landed
        let adt = dt;  // adjusted delta time
        if (slowMoRef.current > 0) {
          slowMoRef.current = Math.max(0, slowMoRef.current - dt);
          adt = dt * SLOMO_FACTOR;
        }

        const active = rounds.isFighting;
        player.update(adt, active ? input : FROZEN_INPUT);

        if (twoPlayer) {
          enemy.update(adt, active ? input2 : FROZEN_INPUT);
        } else {
          enemy.update(adt, player, active);
        }

        if (active) {
          if (!musicStarted) { audio?.startBattleMusic(); musicStarted = true; }
          combat.checkHit(player, [enemy]);
          combat.checkHit(enemy,  [player]);
        }

        rounds.update(adt, player, enemy);
        if (rounds.isOver && !matchDone) {
          matchDone = true;
          audio?.stopBattleMusic();
        }

        input.consumeFrame();
        input2?.consumeFrame();
      },

      render(dt) {
        renderer.draw({
          player,
          entities:   [enemy],
          background: sprites.get(level?.bgKey ?? 'bg_01'),
        }, dt);

        frameCount++;
        if (frameCount % 3 === 0) {
          setHudState({
            playerHp:    player.hp,
            enemyHp:     enemy.hp,
            maxHp:       player.maxHp,
            scores:      { ...rounds.scores },
            round:       rounds.round,
            overlay:     rounds.overlayText ? { text: rounds.overlayText, style: rounds.overlayStyle } : null,
            matchOver:   rounds.isOver,
            winner:      rounds.winner,
            playerCombo: player.hitCombo ?? 0,
            enemyCombo:  enemy.hitCombo  ?? 0,
          });
        }

        // Online host → broadcast authoritative state at ~30Hz (every 2nd frame).
        // Keeps flowing after the match ends so the guest sees the final state.
        if (isHost && frameCount % 2 === 0) {
          const packF = (f) => [f.x, f.z, f.jumpY, f.facingLeft ? 1 : 0, f.hurt ? 1 : 0, f.anim.animName, f.anim.frameIndex];
          net.send({
            t: 's',
            mid: matchIdRef.current,
            p: packF(player),
            e: packF(enemy),
            hud: {
              ph: player.hp, eh: enemy.hp,
              sp: rounds.scores.player, se: rounds.scores.enemy,
              rd: rounds.round,
              ot: rounds.overlayText, os: rounds.overlayStyle,
              over: rounds.isOver, win: rounds.winner,
              pc: player.hitCombo ?? 0, ec: enemy.hitCombo ?? 0,
            },
            paused: pausedRef.current,
          });
        }
      },
    });

    loop.start();
    return () => {
      loop.stop();
      input.detach();
      inputRef.current  = null;
      inputRef2.current = null;
      gpad1.reset();
      gpad2?.reset();
      if (isHost) net.onMessage = null;
      audio?.stopBattleMusic();
    };
  }, [sprites]);

  const resume = () => { pausedRef.current = false; setPaused(false); };

  return (
    <div
      className="relative overflow-hidden"
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="block"
        style={{ imageRendering: 'pixelated', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'none' }}
      />

      <HUD
        playerHp={hudState.playerHp}
        enemyHp={hudState.enemyHp}
        maxHp={hudState.maxHp}
        scores={hudState.scores}
        round={hudState.round}
        playerCombo={hudState.playerCombo}
        enemyCombo={hudState.enemyCombo}
        onPause={togglePause}
        paused={paused}
        p1Name={p1Name}
        p2Name={p2Name}
      />

      {hudState.overlay && !hudState.matchOver && !paused && (
        <Overlay text={hudState.overlay.text} style={hudState.overlay.style} />
      )}

      {paused && !hudState.matchOver && !oppLeft && (
        <PauseOverlay onResume={resume} onQuit={doQuit} />
      )}

      {hudState.matchOver && !oppLeft && (
        <MatchOver
          winner={hudState.winner}
          pts={(hudState.winner === 'player' && !twoPlayer) || iWonOnline ? ptsEarned : null}
          onRematch={doRematch}
          onQuit={doQuit}
          p1Name={p1Name}
          p2Name={p2Name}
        />
      )}

      {/* Opponent disconnected / quit the online match */}
      {oppLeft && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-6 pointer-events-auto select-none"
          style={{ background: 'rgba(0,0,0,0.8)', zIndex: 50, fontFamily: 'var(--font-pixel)' }}
        >
          <p style={{ fontSize: '1rem', letterSpacing: '0.15em', color: '#f87171', textShadow: '0 0 20px #f87171' }}>
            OPPONENT LEFT
          </p>
          <button
            onClick={onQuit}
            style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.55rem', letterSpacing: '0.15em', color: '#fff', border: '2px solid rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.1)', padding: '8px 24px', cursor: 'pointer' }}
          >
            QUIT
          </button>
        </div>
      )}

      {/* Touch controls — hidden in LOCAL 2P (both players on physical pads);
          shown online since each player is on their own device */}
      {(!twoPlayer || isOnline) && <TouchControls inputRef={inputRef} />}

      {/* Keyboard hint — hidden on touch devices */}
      {!IS_TOUCH && (
        <div
          className="absolute bottom-2 right-3 text-right pointer-events-none select-none"
          style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.38rem', lineHeight: '1.8', color: 'rgba(255,255,255,0.25)', zIndex: 5 }}
        >
          <div>Move WASD/↑↓←→ · Jump K · Block Space · ESC Pause</div>
          <div>Punch J · Kick L · Power U · Combo I · Special O</div>
        </div>
      )}
    </div>
  );
}
