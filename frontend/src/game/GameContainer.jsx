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

// ─── Sprite manifest ──────────────────────────────────────────────────────────
// Vite resolves these import URLs at build time → hashed, tree-shaken, CDN-safe.
import katieIdleUrl   from './assets/katie_idle.png';
import katieWalk01Url from './assets/katie_walk_01.png';
import katieWalk02Url from './assets/katie_walk_02.png';

const SPRITE_MANIFEST = {
  katie_idle:    katieIdleUrl,
  katie_walk_01: katieWalk01Url,
  katie_walk_02: katieWalk02Url,
};

// ─── HUD overlay ─────────────────────────────────────────────────────────────

function HUD({ player }) {
  if (!player) return null;
  return (
    <div className="absolute top-3 left-3 text-xs font-mono text-white/80 space-y-0.5 pointer-events-none select-none">
      <div>X: <span className="text-green-400">{Math.round(player.x)}</span></div>
      <div>Z: <span className="text-blue-400">{Math.round(player.z)}</span></div>
      <div>jumpY: <span className="text-yellow-400">{Math.round(player.jumpY)}</span></div>
      <div className="mt-1 text-white/50">
        {player.grounded ? '● grounded' : '↑ airborne'}
      </div>
    </div>
  );
}

function Controls() {
  return (
    <div className="absolute bottom-3 right-3 text-xs font-mono text-white/40 text-right pointer-events-none select-none leading-5">
      <div>Move  WASD / ↑↓←→</div>
      <div>Jump  K</div>
      <div>Attack  J</div>
      <div>Special  L</div>
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
          renderer.draw({ player });

          // Mirror state to HUD at ~10 fps
          frameCount++;
          if (frameCount % 6 === 0) {
            setHudState({
              x:        player.x,
              z:        player.z,
              jumpY:    player.jumpY,
              grounded: player.grounded,
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
