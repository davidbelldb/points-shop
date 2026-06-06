/**
 * GameScreen
 *
 * Wires together the full game loop:
 *   Player input → Enemy AI → Combat → RoundManager → Render
 *
 * React handles the HUD (HP bars, score pips, round counter, overlays).
 * The canvas handles the scene.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { GameLoop }      from '../engine/GameLoop.js';
import { InputManager }  from '../engine/InputManager.js';
import { CombatSystem }  from '../engine/CombatSystem.js';
import { RoundManager }  from '../engine/RoundManager.js';
import { Player }        from '../entities/Player.js';
import { Enemy }         from '../entities/Enemy.js';
import { Renderer }      from '../renderer/Renderer.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants.js';

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
        className="text-xs font-black tracking-widest select-none"
        style={{ fontFamily: 'monospace', color: '#ffffffcc', textShadow: '0 0 6px #000' }}
      >
        {name}
      </span>
      <div
        className="relative overflow-hidden"
        style={{
          width:      260,
          height:     18,
          background: '#111',
          border:     '2px solid #ffffff44',
          boxShadow:  'inset 0 1px 4px #000',
        }}
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
  const pips = [0, 1].map(i => (
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
  ));
  return (
    <div className={`flex gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {pips}
    </div>
  );
}

function HUD({ playerHp, enemyHp, maxHp, scores, round }) {
  return (
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
        className="flex flex-col items-center gap-0.5 pt-1"
        style={{ fontFamily: 'monospace', color: '#ffffff99' }}
      >
        <span className="text-xs tracking-widest">ROUND</span>
        <span className="text-xl font-black" style={{ color: '#fff', textShadow: '0 0 10px #fff8' }}>
          {round}
        </span>
      </div>

      {/* David — right */}
      <div className="flex flex-col gap-1 items-end">
        <HealthBar name="DAVID" hp={enemyHp} maxHp={maxHp} align="right" />
        <WinPips wins={scores.enemy} align="right" />
      </div>
    </div>
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
          fontFamily:   'monospace',
          fontSize:     isFight ? '4.5rem' : isNumber ? '7rem' : '3.5rem',
          fontWeight:   900,
          color:        isFight ? '#fbbf24' : '#ffffff',
          textShadow:   isFight
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
      style={{ background: 'rgba(0,0,0,0.75)', zIndex: 30, fontFamily: 'monospace' }}
    >
      <p
        className="text-4xl font-black tracking-widest"
        style={{ color: '#fbbf24', textShadow: '0 0 30px #fbbf24' }}
      >
        {winner === 'player' ? 'KATIE WINS!' : 'DAVID WINS!'}
      </p>
      <div className="flex gap-6">
        <button
          onClick={onRematch}
          className="px-6 py-2 text-sm tracking-widest font-bold border-2 border-white/40 text-white hover:bg-white/10 transition"
        >
          REMATCH
        </button>
        <button
          onClick={onQuit}
          className="px-6 py-2 text-sm tracking-widest font-bold border-2 border-white/20 text-white/50 hover:bg-white/10 transition"
        >
          QUIT
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GameScreen({ sprites, character, level, onQuit }) {
  const canvasRef = useRef(null);

  const [hudState, setHudState] = useState({
    playerHp:  100,
    enemyHp:   100,
    maxHp:     100,
    scores:    { player: 0, enemy: 0 },
    round:     1,
    overlay:   { text: '3', style: 'number' },
    matchOver: false,
    winner:    null,
  });

  // Stable rematch callback — signals parent or resets internally
  const handleRematch = useCallback(() => {
    setHudState(s => ({
      ...s,
      playerHp: 100, enemyHp: 100,
      scores: { player: 0, enemy: 0 },
      round: 1,
      overlay: { text: '3', style: 'number' },
      matchOver: false,
      winner: null,
    }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sprites) return;

    const input    = new InputManager().attach(window);
    const player   = new Player({ x: 200, z: 30 });
    const enemy    = new Enemy({ x: 620, z: 30 });
    const renderer = new Renderer(canvas, sprites);
    const combat   = new CombatSystem();
    const rounds   = new RoundManager();

    let frameCount = 0;
    let matchDone  = false;

    const loop = new GameLoop({
      update(dt) {
        if (matchDone) return;

        // Only allow player input while fighting
        if (rounds.isFighting) {
          player.update(dt, input);
          enemy.update(dt, player);
          combat.checkHit(player, [enemy]);
          // Future: combat.checkHit(enemy, [player]);
        }

        rounds.update(dt, player, enemy);

        if (rounds.isOver && !matchDone) {
          matchDone = true;
        }

        input.consumeFrame();
      },

      render(_dt) {
        renderer.draw({
          player,
          entities: [enemy],
          background: sprites.get(level?.bgKey ?? 'bg_01'),
        });

        frameCount++;
        if (frameCount % 3 === 0) {
          setHudState({
            playerHp:  player.hp,
            enemyHp:   enemy.hp,
            maxHp:     player.maxHp,
            scores:    { ...rounds.scores },
            round:     rounds.round,
            overlay:   rounds.overlayText
              ? { text: rounds.overlayText, style: rounds.overlayStyle }
              : null,
            matchOver: rounds.isOver,
            winner:    rounds.winner,
          });
        }
      },
    });

    loop.start();
    return () => { loop.stop(); input.detach(); };
  }, [sprites]);

  // Rematch: re-mount by changing a key (simplest reset approach)
  const [matchKey, setMatchKey] = useState(0);
  const rematch = () => { handleRematch(); setMatchKey(k => k + 1); };

  return (
    <div
      key={matchKey}
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
      />

      {hudState.overlay && !hudState.matchOver && (
        <Overlay text={hudState.overlay.text} style={hudState.overlay.style} />
      )}

      {hudState.matchOver && (
        <MatchOver
          winner={hudState.winner}
          onRematch={rematch}
          onQuit={onQuit}
        />
      )}

      {/* Controls hint */}
      <div
        className="absolute bottom-2 right-3 text-right pointer-events-none select-none leading-5"
        style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)' }}
      >
        <div>Move WASD / ↑↓←→ · Jump K</div>
        <div>Punch J · Kick L · Power U · Combo I · Piano O</div>
      </div>
    </div>
  );
}
