/**
 * GamepadManager
 *
 * Polls a single gamepad slot each frame and translates button/axis state
 * into InputManager inject calls.  Designed to be called from inside the
 * game-loop update function so it stays in sync with the physics tick.
 *
 * Standard layout (Xbox / PlayStation / Switch Pro all comply):
 *   Button  0  A / Cross       → JUMP
 *   Button  1  B / Circle      → KICK
 *   Button  2  X / Square      → PUNCH
 *   Button  3  Y / Triangle    → COMBO
 *   Button  4  LB / L1         → BLOCK
 *   Button  5  RB / R1         → POWER_KICK
 *   Button  6  LT / L2         → PIANO (special)
 *   Button  7  RT / R2         → PIANO (same action, either trigger fires)
 *   Button  9  Start/Options/+ → onPause callback
 *   Button 12  D-pad Up        → UP
 *   Button 13  D-pad Down      → DOWN
 *   Button 14  D-pad Left      → LEFT
 *   Button 15  D-pad Right     → RIGHT
 *
 *   Left stick axis 0 (X)  → LEFT / RIGHT
 *   Left stick axis 1 (Y)  → UP   / DOWN
 */

const BUTTON_ACTIONS = {
  0:  'JUMP',
  1:  'KICK',
  2:  'PUNCH',
  3:  'COMBO',
  4:  'BLOCK',
  5:  'POWER_KICK',
  6:  'PIANO',
  7:  'PIANO',
  12: 'UP',
  13: 'DOWN',
  14: 'LEFT',
  15: 'RIGHT',
};

const AXIS_DEADZONE = 0.28;

export class GamepadManager {
  /**
   * @param {number}  gamepadIndex  – 0 for P1, 1 for P2, etc.
   * @param {React.RefObject} inputRef  – ref whose .current is an InputManager
   * @param {{ onPause?: () => void }} options
   */
  constructor(gamepadIndex, inputRef, { onPause } = {}) {
    this.gamepadIndex = gamepadIndex;
    this.inputRef     = inputRef;
    this.onPause      = onPause ?? null;

    this._prevButtons = {};   // buttonIndex → bool
    this._prevAxes    = { left: false, right: false, up: false, down: false };
  }

  /**
   * Call once per game-loop tick.  Reads the current gamepad snapshot and
   * fires inject calls for any changes since the last tick.
   */
  poll() {
    const gamepads = navigator.getGamepads?.() ?? [];
    const gp       = gamepads[this.gamepadIndex];
    if (!gp || !gp.connected) return;

    const input = this.inputRef?.current;

    // ── Face / shoulder / d-pad buttons ───────────────────────────────────
    for (const [idxStr, action] of Object.entries(BUTTON_ACTIONS)) {
      const idx     = Number(idxStr);
      if (idx >= gp.buttons.length) continue;
      const pressed    = gp.buttons[idx].pressed;
      const wasPressed = this._prevButtons[idx] ?? false;

      if (pressed !== wasPressed) {
        if (pressed) input?.injectPress(action);
        else         input?.injectRelease(action);
      }
      this._prevButtons[idx] = pressed;
    }

    // ── Start / Options / + (index 9) → pause ─────────────────────────────
    if (gp.buttons[9]) {
      const pressed    = gp.buttons[9].pressed;
      const wasPressed = this._prevButtons[9] ?? false;
      if (pressed && !wasPressed) this.onPause?.();
      this._prevButtons[9] = pressed;
    }

    // ── Left stick ─────────────────────────────────────────────────────────
    const ax = gp.axes[0] ?? 0;
    const ay = gp.axes[1] ?? 0;

    const leftNow  = ax < -AXIS_DEADZONE;
    const rightNow = ax >  AXIS_DEADZONE;
    const upNow    = ay < -AXIS_DEADZONE;
    const downNow  = ay >  AXIS_DEADZONE;

    if (leftNow  !== this._prevAxes.left)  { leftNow  ? input?.injectPress('LEFT')  : input?.injectRelease('LEFT');  this._prevAxes.left  = leftNow;  }
    if (rightNow !== this._prevAxes.right) { rightNow ? input?.injectPress('RIGHT') : input?.injectRelease('RIGHT'); this._prevAxes.right = rightNow; }
    if (upNow    !== this._prevAxes.up)    { upNow    ? input?.injectPress('UP')    : input?.injectRelease('UP');    this._prevAxes.up    = upNow;    }
    if (downNow  !== this._prevAxes.down)  { downNow  ? input?.injectPress('DOWN')  : input?.injectRelease('DOWN');  this._prevAxes.down  = downNow;  }
  }

  /** Release all held inputs — call on disconnect or scene teardown. */
  reset() {
    const input = this.inputRef?.current;
    const actions = new Set([...Object.values(BUTTON_ACTIONS), 'LEFT', 'RIGHT', 'UP', 'DOWN']);
    for (const action of actions) input?.injectRelease(action);
    this._prevButtons = {};
    this._prevAxes    = { left: false, right: false, up: false, down: false };
  }
}
