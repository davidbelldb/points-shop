/**
 * GameScreen
 *
 * The actual canvas game. Receives a pre-loaded SpriteManager and
 * the selected character so it can start the loop immediately with
 * no loading delay.
 */

import { useEffect, useRef, useState } from 'react';
import { GameLoop }     from '../engine/GameLoop.js';
import { InputManager } from '../engine/InputManager.js';
import { Player }       from '../entities/Player.js';
import { Renderer }     from '../renderer/Renderer.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants.js';

function HUD({ player }) {
  if (!player) return null;
  return (
    <div className="absolute top-3 left-3 text-xs font-mono text-white/70 space-y-0.5 pointer-events-none select-none">
      <div>X: <span className="text-green-400">{Math.round(player.x)}</span></div>
      <div>Z: <span className="text-blue-400">{Math.round(player.z)}</span></div>
      <div className="text-white/40">{player.grounded ? '● grounded' : '↑ airborne'}</div>
      <div className="text-purple-400">{player.anim}</div>
    </div>
  );
}

function Controls() {
  return (
    <div className="absolute bottom-3 right-3 text-xs font-mono text-white/30 text-right pointer-events-none select-none leading-5">
      <div>Move  WASD / ↑↓←→</div>
      <div>Jump  K</div>
      <div>Punch  J</div>
      <div>Kick  L</div>
      <div>Power Kick  U</div>
      <div>Combo  I</div>
      <div>Piano Attack  O</div>
    </div>
  );
}

export default function GameScreen({ sprites, character }) {
  const canvasRef = useRef(null);
  const [hudState, setHudState] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sprites) return;

    const input    = new InputManager().attach(window);
    const player   = new Player({ x: 400, z: 30 });
    const renderer = new Renderer(canvas, sprites);
    let frameCount = 0;

    const loop = new GameLoop({
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
            grounded: player.grounded,
            anim:     player.anim.animName,
          });
        }
      },
    });

    loop.start();
    return () => { loop.stop(); input.detach(); };
  }, [sprites]);

  return (
    <div className="relative" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="block"
        style={{ imageRendering: 'pixelated' }}
      />
      <HUD player={hudState} />
      <Controls />
    </div>
  );
}
