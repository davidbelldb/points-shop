/**
 * InputManager
 *
 * Tracks keyboard state as three sets:
 *   held     – key is currently down
 *   pressed  – key went down THIS frame (cleared after each consumeFrame())
 *   released – key went up   THIS frame (cleared after each consumeFrame())
 *
 * Actions are resolved through ACTION_MAP so the rest of the engine never
 * needs to know about raw key codes.
 */

// ─── Key → Action map ─────────────────────────────────────────────────────────
const ACTION_MAP = {
  // Movement
  ArrowLeft:  'LEFT',
  ArrowRight: 'RIGHT',
  ArrowUp:    'UP',
  ArrowDown:  'DOWN',
  KeyA:       'LEFT',
  KeyD:       'RIGHT',
  KeyW:       'UP',
  KeyS:       'DOWN',

  // Combat
  KeyJ: 'PUNCH',       // light punch combo
  KeyK: 'JUMP',        // jump
  Space: 'BLOCK',      // hold to block incoming attacks
  KeyL: 'KICK',        // kick
  KeyU: 'POWER_KICK',  // special — jumping spin kick
  KeyI: 'COMBO',       // special — punch-kick combo
  KeyO: 'PIANO',       // special — piano attack (10-hit)
};

export class InputManager {
  constructor() {
    this._held     = new Set();
    this._pressed  = new Set();
    this._released = new Set();

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp   = this._onKeyUp.bind(this);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  attach(target = window) {
    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup',   this._onKeyUp);
    // Prevent arrow keys from scrolling the page while the game has focus
    target.addEventListener('keydown', this._preventScroll, { passive: false });
    this._target = target;
    return this;
  }

  detach() {
    if (!this._target) return;
    this._target.removeEventListener('keydown', this._onKeyDown);
    this._target.removeEventListener('keyup',   this._onKeyUp);
    this._target.removeEventListener('keydown', this._preventScroll);
    this._target = null;
  }

  // ── Per-frame consumption ───────────────────────────────────────────────────
  /** Call once per game-loop frame AFTER update() to flush transient sets. */
  consumeFrame() {
    this._pressed.clear();
    this._released.clear();
  }

  // ── Query API ───────────────────────────────────────────────────────────────
  isHeld    (action) { return this._held.has(action);     }
  isPressed (action) { return this._pressed.has(action);  }
  isReleased(action) { return this._released.has(action); }

  /** Snapshot of all currently-held actions (useful for debugging). */
  heldActions() { return [...this._held]; }

  // ── Touch injection ─────────────────────────────────────────────────────────
  /**
   * Simulate a key-down for `action` (called from TouchControls on pointerdown).
   * Only adds to _pressed on the leading edge, same as _onKeyDown.
   */
  injectPress(action) {
    if (!this._held.has(action)) this._pressed.add(action);
    this._held.add(action);
  }

  /**
   * Simulate a key-up for `action` (called from TouchControls on pointerup/cancel).
   */
  injectRelease(action) {
    this._held.delete(action);
    this._released.add(action);
  }

  // ── Private handlers ────────────────────────────────────────────────────────
  _onKeyDown(e) {
    const action = ACTION_MAP[e.code];
    if (!action) return;
    if (!this._held.has(action)) {
      this._pressed.add(action); // only on the leading edge
    }
    this._held.add(action);
  }

  _onKeyUp(e) {
    const action = ACTION_MAP[e.code];
    if (!action) return;
    this._held.delete(action);
    this._released.add(action);
  }

  _preventScroll(e) {
    const scrollKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
    if (scrollKeys.includes(e.code)) e.preventDefault();
  }
}
