/**
 * GameLoop
 *
 * Drives the game using requestAnimationFrame.
 * Provides a stable, delta-time-based tick so physics and movement are
 * frame-rate independent.
 *
 * Usage:
 *   const loop = new GameLoop({ update, render });
 *   loop.start();
 *   loop.stop();   // call on component unmount
 */

import { MAX_DELTA } from '../constants.js';

export class GameLoop {
  /**
   * @param {{ update: (dt: number) => void, render: (dt: number) => void }} callbacks
   */
  constructor({ update, render }) {
    this._update  = update;
    this._render  = render;
    this._rafId   = null;
    this._lastTs  = null;
    this._running = false;

    this._tick = this._tick.bind(this);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  start() {
    if (this._running) return;
    this._running = true;
    this._lastTs  = null;
    this._rafId   = requestAnimationFrame(this._tick);
  }

  stop() {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  get isRunning() { return this._running; }

  // ── Private ─────────────────────────────────────────────────────────────────

  _tick(timestamp) {
    if (!this._running) return;

    // Bootstrap: no dt on first frame
    if (this._lastTs === null) {
      this._lastTs = timestamp;
      this._rafId  = requestAnimationFrame(this._tick);
      return;
    }

    // Delta time in seconds, capped to prevent spiral-of-death on tab resume
    const dt = Math.min((timestamp - this._lastTs) / 1000, MAX_DELTA);
    this._lastTs = timestamp;

    this._update(dt);
    this._render(dt);

    this._rafId = requestAnimationFrame(this._tick);
  }
}
