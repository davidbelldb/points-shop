/**
 * GameContainer
 *
 * React wrapper for the beat-em-up engine.
 * Owns the <canvas> ref and wires together:
 *   InputManager → Player.update() → Renderer.draw()
 * via GameLoop.
 *
 * Everything is cleaned up on unmount so React Strict Mode double-invocation
 * and hot reloads work correctly.
 */

import { useEffect, useRef, useState } from 'react';
import { GameLoop }    from './engine/GameLoop.js';
import { InputManager } from './engine/InputManager.js';
import { Player }      from './entities/Player.js';
import { Renderer }    from './renderer/Renderer.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';

// ─── HUD overlay (pure React, drawn on top of canvas) ────────────────────────

function HUD({ player }) {
  if (!player) return null;
  return (
    <div className="absolute top-3 left-3 text-xs font-mono text-white/80 space-y-0.5 pointer-events-none select-none">
      <div>X: <span className="text-green-400">{Math.round(player.x)}</span></div>
      <div>Z: <span className="text-blue-400">{Math.round(player.z)}</span></div>
      <div>
        jumpY: <span className="text-yellow-400">{Math.round(player.jumpY)}</span>
      </div>
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function GameContainer() {
  const canvasRef  = useRef(null);
  // Mirror a small subset of player state into React for the HUD
  const [hudState, setHudState] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Instantiate engine objects ────────────────────────────────────────────
    const input    = new InputManager().attach(window);
    const player   = new Player({ x: 400, z: 100 });
    const renderer = new Renderer(canvas);

    let frameCount = 0;

    const loop = new GameLoop({
      update(dt) {
        player.update(dt, input);
        input.consumeFrame(); // flush pressed/released after all updates
      },
      render(_dt) {
        renderer.draw({ player });

        // Update HUD at ~10fps to avoid re-rendering every frame
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

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      loop.stop();
      input.detach();
    };
  }, []);

  return (
    <div
      className="relative flex items-center justify-center w-full h-full bg-black"
      // Ensure keyboard events reach the window listener when the canvas is clicked
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
        <HUD player={hudState} />
        <Controls />
      </div>
    </div>
  );
}
