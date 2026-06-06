/**
 * GameContainer
 *
 * React wrapper for the beat-em-up engine.
 * Wires together:  InputManager → Player.update() → Renderer.draw()
 * via GameLoop, with sprite assets preloaded before the first frame.
 *
 * Sprite URLs are resolved by Vite at build time (hashed, CDN-ready).
 * The game loop only starts once every image has loaded so we never
 * render a frame with a missing sprite.
 */

import { useEffect, useRef, useState } from 'react';
import { GameLoop }      from './engine/GameLoop.js';
import { InputManager }  from './engine/InputManager.js';
import { SpriteManager } from './engine/SpriteManager.js';
import { Player }        from './entities/Player.js';
import { Renderer }      from './renderer/Renderer.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';

// ─── Asset manifest ───────────────────────────────────────────────────────────
// Vite resolves these import URLs at build time → hashed, tree-shaken, CDN-safe.
import katieIdleUrl      from '../assets/sprites/katie_idle.png';
import katieWalk01Url    from '../assets/sprites/katie_walk_01.png';
import katieWalk02Url    from '../assets/sprites/katie_walk_02.png';
import katieWalk03Url    from '../assets/sprites/katie_walk_03.png';
import katieJumpUrl      from '../assets/sprites/katie_jump.png';
import katiePunch01Url   from '../assets/sprites/katie_punch_01.png';
import katiePunch02Url   from '../assets/sprites/katie_punch_02.png';
import katiePunch03Url   from '../assets/sprites/katie_punch_03.png';
import katieKick01Url    from '../assets/sprites/katie_kick_01.png';
import katieKick02Url    from '../assets/sprites/katie_kick_02.png';
import katiePK01Url      from '../assets/sprites/katie_power_kick_01.png';
import katiePK02Url      from '../assets/sprites/katie_power_kick_02.png';
import katiePK03Url      from '../assets/sprites/katie_power_kick_03.png';
import katiePK04Url      from '../assets/sprites/katie_power_kick_04.png';
import katiePK05Url      from '../assets/sprites/katie_power_kick_05.png';
import combo01Url        from '../assets/sprites/punch_kick_combo_01.png';
import combo02Url        from '../assets/sprites/punch_kick_combo_02.png';
import combo03Url        from '../assets/sprites/punch_kick_combo_03.png';
import combo04Url        from '../assets/sprites/punch_kick_combo_04.png';
import background01Url   from '../assets/backgrounds/background_01.png';

const SPRITE_MANIFEST = {
  katie_idle:          katieIdleUrl,
  katie_walk_01:       katieWalk01Url,
  katie_walk_02:       katieWalk02Url,
  katie_walk_03:       katieWalk03Url,
  katie_jump:          katieJumpUrl,
  katie_punch_01:      katiePunch01Url,
  katie_punch_02:      katiePunch02Url,
  katie_punch_03:      katiePunch03Url,
  katie_kick_01:       katieKick01Url,
  katie_kick_02:       katieKick02Url,
  katie_power_kick_01: katiePK01Url,
  katie_power_kick_02: katiePK02Url,
  katie_power_kick_03: katiePK03Url,
  katie_power_kick_04: katiePK04Url,
  katie_power_kick_05: katiePK05Url,
  punch_kick_combo_01: combo01Url,
  punch_kick_combo_02: combo02Url,
  punch_kick_combo_03: combo03Url,
  punch_kick_combo_04: combo04Url,
  bg_01:               background01Url,
};

// ─── HUD overlay ─────────────────────────────────────────────────────────────

function HUD({ player }) {
  if (!player) return null;
  return (
    <div className="absolute top-3 left-3 text-xs font-mono text-white/80 space-y-0.5 pointer-events-none select-none">
      <div>X: <span className="text-green-400">{Math.round(player.x)}</span></div>
      <div>Z: <span className="text-blue-400">{Math.round(player.z)}</span></div>
      <div>jumpY: <span className="text-yellow-400">{Math.round(player.jumpY)}</span></div>
      <div className="mt-1 text-white/50">{player.grounded ? '● grounded' : '↑ airborne'}</div>
      <div className="text-purple-400">{player.anim}</div>
    </div>
  );
}

function Controls() {
  return (
    <div className="absolute bottom-3 right-3 text-xs font-mono text-white/40 text-right pointer-events-none select-none leading-5">
      <div>Move  WASD / ↑↓←→</div>
      <div>Jump  K</div>
      <div>Punch  J</div>
      <div>Kick  L</div>
      <div>Power Kick  U</div>
      <div>Combo  I</div>
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70">
      <span className="text-white/60 text-sm font-mono tracking-widest animate-pulse">
        LOADING…
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GameContainer() {
  const canvasRef       = useRef(null);
  const [hudState,     setHudState]     = useState(null);
  const [spritesReady, setSpritesReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let loop;
    let input;
    let cancelled = false;

    // ── Preload sprites, then boot the engine ─────────────────────────────────
    const sprites = new SpriteManager();

    sprites.preload(SPRITE_MANIFEST).then(() => {
      if (cancelled) return;   // component unmounted while loading

      setSpritesReady(true);

      input            = new InputManager().attach(window);
      const player     = new Player({ x: 400, z: 100 });
      const renderer   = new Renderer(canvas, sprites);
      let   frameCount = 0;

      loop = new GameLoop({
        update(dt) {
          player.update(dt, input);
          input.consumeFrame();
        },
        render(_dt) {
          renderer.draw({ player, background: sprites.get('bg_01') });

          frameCount++;
          if (frameCount % 6 === 0) {
            setHudState({
              x:        player.x,
              z:        player.z,
              jumpY:    player.jumpY,
              grounded: player.grounded,
              anim:     player.anim.animName,
            });
          }
        },
      });

      loop.start();
    });

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cancelled = true;
      loop?.stop();
      input?.detach();
    };
  }, []);

  return (
    <div
      className="relative flex items-center justify-center w-full h-full bg-black"
      tabIndex={-1}
    >
      <div className="relative" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block rounded-sm"
          style={{ imageRendering: 'pixelated' }}
        />
        {!spritesReady && <LoadingOverlay />}
        <HUD player={hudState} />
        <Controls />
      </div>
    </div>
  );
}
