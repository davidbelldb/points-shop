/**
 * GameScreen
 *
 * Wires together the full game loop:
 *   Player input → Enemy AI → Combat → RoundManager → Render
 *
 * React handles the HUD (HP bars, score pips, round counter, combo display, overlays).
 * The canvas handles the scene.
 *
 * Props:
 *   audio  — shared AudioManager from GameContainer (also handles menu music)
 */

import { useEffect, useRef, useState } from 'react';
import { GameLoop }      from '../engine/GameLoop.js';
import { InputManager }  from '../engine/InputManager.js';
import { CombatSystem }  from '../engine/CombatSystem.js';
import { RoundManager }  from '../engine/RoundManager.js';
import { Player }        from '../entities/Player.js';
import { Enemy }         from '../entities/Enemy.js';
import { Renderer }      from '../renderer/Renderer.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants.js';
import TouchControls     from './TouchControls.jsx';

// ─── Sub-components ───────────────────────────────────────────────────────────

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
      <span
        className="select-none"
        style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.45rem', letterSpacing: '0.15em', color: '#ffffffcc', textShadow: '0 0 6px #000' }}
      >
        {name}
      </span>
      <div
        className="relative overflow-hidden"
        style={{ width: 260, height: 18, background: '#111', border: '2px solid #ffffff44', boxShadow: 'inset 0 1px 4px #000' }}
      >
        <div
          style={{
            position:   'absolute',
            top: 0, bottom: 0,
            left:       align === 'left' ? 0 : 'auto',
            right:      align === 'right' ? 0 : 'auto',
            width:      `${pct * 100}%`,
            background: color,
            boxShadow:  `0 0 8px ${color}88`,
            transition: 'width 0.1s linear, background 0.3s',
          }}
        />
      </div>
    </div>
  );
}

function WinPips({ wins, align = 'left' }) {
  return (
    <div className={`flex gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {[0, 1].map(i => (
        <div
          key={i}
          style={{
            width:      10,
            height:     10,
            background: i < wins ? '#fbbf24' : 'transparent',
            border:     '2px solid #fbbf2488',
            boxShadow:  i < wins ? '0 0 6px #fbbf24' : 'none',
          }}
        />
      ))}
    </div>
  );
}

function ComboDisplay({ count, align = 'left' }) {
  if (count < 2) return null;
  const scale = Math.min(1.1, 0.65 + count * 0.05);
  const color = align === 'left' ? '#fbbf24' : '#f87171';
  return (
    <div
      style={{
        position:   'absolute',
        [align]:    12,
        bottom:     72,
        fontFamily: 'var(--font-pixel)',
        fontSize:   `${scale}rem`,
        color,
        textShadow: `0 0 18px ${color}, 2px 2px 0 #000`,
        letterSpacing: '0.05em',
        textAlign:  align === 'right' ? 'right' : 'left',
        pointerEvents: 'none',
        zIndex:     15,
        animation:  'comboFade 0.18s ease-out',
      }}
    >
      {count} HIT{count >= 5 ? ' COMBO!' : ''}
    </div>
  );
}

function HUD({ playerHp, enemyHp, maxHp, scores, round, playerCombo, enemyCombo }) {
  return (
    <>
      <div
        className="absolute top-0 left-0 right-0 flex items-start justify-between px-3 pt-2 pointer-events-none select-none"
        style={{ zIndex: 10 }}
      >
        {/* Katie — left */}
        <div className="flex flex-col gap-1">
          <HealthBar name="KATIE" hp={playerHp} maxHp={maxHp} align="left" />
          <WinPips wins={scores.player} align="left" />
        </div>

        {/* Round counter — centre */}
        <div
          className="flex flex-col items-center gap-1 pt-1"
          style={{ fontFamily: 'var(--font-pixel)', color: '#ffffff99' }}
        >
          <span style={{ fontSize: '0.45rem', letterSpacing: '0.2em' }}>ROUND</span>
          <span style={{ fontSize: '1.2rem', color: '#fff', textShadow: '0 0 10px #fff8' }}>
            {round}
          </span>
        </div>

        {/* David — right */}
        <div className="flex flex-col gap-1 items-end">
          <HealthBar name="DAVID" hp={enemyHp} maxHp={maxHp} align="right" />
          <WinPips wins={scores.enemy} align="right" />
        </div>
      </div>

      {/* Combo counters */}
      <ComboDisplay count={playerCombo} align="left"  />
      <ComboDisplay count={enemyCombo}  align="right" />

      {/* Keyframes for combo pop */}
      <style>{`@keyframes comboFade { from { opacity:0; transform:scale(1.3) } to { opacity:1; transform:scale(1) } }`}</style>
    </>
  );
}

function Overlay({ text, style: overlayStyle }) {
  if (!text) return null;
  const isFight  = overlayStyle === 'fight';
  const isNumber = overlayStyle === 'number';
  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
      style={{ zIndex: 20 }}
    >
      <span
        style={{
          fontFamily:    'var(--font-pixel)',
          fontSize:      isFight ? '2.8rem' : isNumber ? '4.5rem' : '2rem',
          color:         isFight ? '#fbbf24' : '#ffffff',
          textShadow:    isFight
            ? '0 0 30px #fbbf24, 0 0 60px #f59e0b, 3px 3px 0 #000'
            : '3px 3px 0 #000, 0 0 20px #fff4',
          letterSpacing: '0.05em',
        }}
      >
        {text}
      </span>
    </div>
  );
}

function MatchOver({ winner, onRematch, onQuit }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-8 pointer-events-auto select-none"
      style={{ background: 'rgba(0,0,0,0.75)', zIndex: 30, fontFamily: 'var(--font-pixel)' }}
    >
      <p style={{ fontSize: '1.4rem', letterSpacing: '0.1em', color: '#fbbf24', textShadow: '0 0 30px #fbbf24' }}>
        {winner === 'player' ? 'KATIE WINS!' : 'DAVID WINS!'}
      </p>
      <div className="flex gap-6">
        <button
          onClick={onRematch}
          className="px-6 py-2 border-2 border-white/40 text-white hover:bg-white/10 transition"
          style={{ fontSize: '0.55rem', letterSpacing: '0.15em' }}
        >
          REMATCH
        </button>
        <button
          onClick={onQuit}
          className="px-6 py-2 border-2 border-white/20 text-white/50 hover:bg-white/10 transition"
          style={{ fontSize: '0.55rem', letterSpacing: '0.15em' }}
        >
          QUIT
        </button>
      </div>
    </div>
  );
}

function PauseOverlay({ onResume, onQuit }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-8 pointer-events-auto select-none"
      style={{ background: 'rgba(0,0,0,0.70)', zIndex: 40, fontFamily: 'var(--font-pixel)' }}
    >
      <p style={{ fontSize: '1.8rem', letterSpacing: '0.3em', color: '#fff', textShadow: '0 0 20px #fff6' }}>
        PAUSED
      </p>
      <div className="flex gap-6">
        <button
          onClick={onResume}
          className="px-6 py-2 border-2 border-white/50 text-white hover:bg-white/10 transition"
          style={{ fontSize: '0.55rem', letterSpacing: '0.15em' }}
        >
          RESUME
        </button>
        <button
          onClick={onQuit}
          className="px-6 py-2 border-2 border-white/20 text-white/50 hover:bg-white/10 transition"
          style={{ fontSize: '0.55rem', letterSpacing: '0.15em' }}
        >
          QUIT
        </button>
      </div>
      <p style={{ fontSize: '0.45rem', letterSpacing: '0.15em', color: '#ffffff44' }}>ESC TO RESUME</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GameScreen({ sprites, character, level, audio, onQuit, onRematch }) {
  const canvasRef  = useRef(null);
  const inputRef   = useRef(null);   // exposed to TouchControls
  const pausedRef  = useRef(false);
  const [paused,   setPaused]   = useState(false);
  const [hudState, setHudState] = useState({
    playerHp:    100,
    enemyHp:     100,
    maxHp:       100,
    scores:      { player: 0, enemy: 0 },
    round:       1,
    overlay:     { text: '3', style: 'number' },
    matchOver:   false,
    winner:      null,
    playerCombo: 0,
    enemyCombo:  0,
  });

  // ESC toggles pause
  useEffect(() => {
    const onEsc = (e) => {
      if (e.code !== 'Escape') return;
      pausedRef.current = !pausedRef.current;
      setPaused(p => !p);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sprites) return;

    const input        = new InputManager().attach(window);
    inputRef.current   = input;                  // expose to TouchControls

    const playerCharId = character ?? 'katie';
    const cpuCharId    = playerCharId === 'katie' ? 'david' : 'katie';
    const player   = new Player({ x: 200, z: 30, characterId: playerCharId });
    const enemy    = new Enemy({  x: 620, z: 30, characterId: cpuCharId });
    const renderer = new Renderer(canvas, sprites);
    const combat   = new CombatSystem();
    const rounds   = new RoundManager();

    // Wire audio + screen shake callbacks
    combat.onAudio = (type) => audio?.play(type);
    combat.onShake = (intensity, duration) => renderer.triggerShake(intensity, duration);

    let frameCount   = 0;
    let matchDone    = false;
    let musicStarted = false;

    const loop = new GameLoop({
      update(dt) {
        if (pausedRef.current || matchDone) return;

        // Always update entities so KO animations play after isFighting → false
        player.update(dt, input);
        enemy.update(dt, player);

        if (rounds.isFighting) {
          if (!musicStarted) {
            audio?.startBattleMusic();
            musicStarted = true;
          }
          combat.checkHit(player, [enemy]);
          combat.checkHit(enemy,  [player]);
        }

        rounds.update(dt, player, enemy);
        if (rounds.isOver && !matchDone) {
          matchDone = true;
          audio?.stopBattleMusic();
        }

        input.consumeFrame();
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
            overlay:     rounds.overlayText
              ? { text: rounds.overlayText, style: rounds.overlayStyle }
              : null,
            matchOver:   rounds.isOver,
            winner:      rounds.winner,
            playerCombo: player.hitCombo ?? 0,
            enemyCombo:  enemy.hitCombo  ?? 0,
          });
        }
      },
    });

    loop.start();
    return () => {
      loop.stop();
      input.detach();
      inputRef.current = null;
      audio?.stopBattleMusic();
    };
  }, [sprites]);   // sprites is stable — runs once per mount

  const resume = () => { pausedRef.current = false; setPaused(false); };

  return (
    <div
      className="relative overflow-hidden"
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="block"
        style={{ imageRendering: 'pixelated' }}
      />

      <HUD
        playerHp={hudState.playerHp}
        enemyHp={hudState.enemyHp}
        maxHp={hudState.maxHp}
        scores={hudState.scores}
        round={hudState.round}
        playerCombo={hudState.playerCombo}
        enemyCombo={hudState.enemyCombo}
      />

      {hudState.overlay && !hudState.matchOver && !paused && (
        <Overlay text={hudState.overlay.text} style={hudState.overlay.style} />
      )}

      {paused && !hudState.matchOver && (
        <PauseOverlay onResume={resume} onQuit={onQuit} />
      )}

      {hudState.matchOver && (
        <MatchOver winner={hudState.winner} onRematch={onRematch} onQuit={onQuit} />
      )}

      {/* On-screen touch controls (only shown on touch devices) */}
      <TouchControls inputRef={inputRef} />

      <div
        className="absolute bottom-2 right-3 text-right pointer-events-none select-none"
        style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.38rem', lineHeight: '1.8', color: 'rgba(255,255,255,0.25)', zIndex: 5 }}
      >
        <div>Move WASD/↑↓←→ · Jump K · Block Space · ESC Pause</div>
        <div>Punch J · Kick L · Power U · Combo I · Special O</div>
      </div>
    </div>
  );
}
