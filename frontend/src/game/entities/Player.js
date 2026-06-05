/**
 * Player Entity
 *
 * Coordinate system
 * ─────────────────
 *  x      – horizontal position along the street  (world-space px)
 *  z      – depth into the screen                 (0 = far, WORLD_MAX_Z = near)
 *  jumpY  – vertical offset due to jumping        (px, > 0 = airborne)
 *
 * The renderer converts (x, z, jumpY) → screen (sx, sy) via perspective lerp.
 *
 * States (additive flags, not a state machine yet):
 *   grounded | jumping | attacking | special
 */

import {
  WORLD_MIN_X, WORLD_MAX_X,
  WORLD_MIN_Z, WORLD_MAX_Z,
  PLAYER_ACCEL,
  PLAYER_FRICTION,
  PLAYER_MAX_SPEED_X,
  PLAYER_MAX_SPEED_Z,
  PLAYER_JUMP_VELOCITY,
  GRAVITY,
  PLAYER_BASE_WIDTH,
  PLAYER_BASE_HEIGHT,
} from '../constants.js';

export class Player {
  constructor({ x = 400, z = 100 } = {}) {
    // ── World position ──────────────────────────────────────────────────────
    this.x     = x;
    this.z     = z;
    this.jumpY = 0;   // pixels above ground (ground = 0)

    // ── Velocity ────────────────────────────────────────────────────────────
    this.vx = 0;  // horizontal velocity (px/s)
    this.vz = 0;  // depth velocity      (depth-units/s)
    this.vy = 0;  // jump velocity       (px/s, positive = upward)

    // ── State flags ─────────────────────────────────────────────────────────
    this.grounded  = true;
    this.attacking = false;
    this.special   = false;
    this.facingLeft = false;

    // ── Dimensions (at base scale; Renderer scales by depth) ────────────────
    this.baseWidth  = PLAYER_BASE_WIDTH;
    this.baseHeight = PLAYER_BASE_HEIGHT;

    // ── Visual tint (placeholder; swapped for sprites in Phase 2) ──────────
    this.color       = '#4ade80';   // green fill
    this.shadowColor = 'rgba(0,0,0,0.35)';
  }

  // ── Main update ─────────────────────────────────────────────────────────────

  /**
   * @param {number}       dt    – delta time in seconds
   * @param {InputManager} input – the shared InputManager instance
   */
  update(dt, input) {
    this._handleMovement(dt, input);
    this._handleJump(dt, input);
    this._handleCombat(input);
  }

  // ── Movement ─────────────────────────────────────────────────────────────────

  _handleMovement(dt, input) {
    const movingLeft  = input.isHeld('LEFT');
    const movingRight = input.isHeld('RIGHT');
    const movingUp    = input.isHeld('UP');
    const movingDown  = input.isHeld('DOWN');

    // ── Horizontal (X) ──────────────────────────────────────────────────────
    if (movingLeft || movingRight) {
      const dir = movingRight ? 1 : -1;
      this.vx += dir * PLAYER_ACCEL * dt;
      this.vx  = Math.max(-PLAYER_MAX_SPEED_X, Math.min(PLAYER_MAX_SPEED_X, this.vx));
      this.facingLeft = movingLeft;
    } else {
      // Friction
      const frictionDelta = PLAYER_FRICTION * dt;
      if (Math.abs(this.vx) <= frictionDelta) {
        this.vx = 0;
      } else {
        this.vx -= Math.sign(this.vx) * frictionDelta;
      }
    }

    // ── Depth (Z) ───────────────────────────────────────────────────────────
    // UP key = move away (decrease z), DOWN key = move toward camera (increase z)
    if (movingUp || movingDown) {
      const dir = movingDown ? 1 : -1;
      this.vz += dir * PLAYER_ACCEL * dt;
      this.vz  = Math.max(-PLAYER_MAX_SPEED_Z, Math.min(PLAYER_MAX_SPEED_Z, this.vz));
    } else {
      const frictionDelta = PLAYER_FRICTION * dt;
      if (Math.abs(this.vz) <= frictionDelta) {
        this.vz = 0;
      } else {
        this.vz -= Math.sign(this.vz) * frictionDelta;
      }
    }

    // ── Apply velocities ────────────────────────────────────────────────────
    this.x = Math.max(WORLD_MIN_X, Math.min(WORLD_MAX_X, this.x + this.vx * dt));
    this.z = Math.max(WORLD_MIN_Z, Math.min(WORLD_MAX_Z, this.z + this.vz * dt));
  }

  // ── Jump ─────────────────────────────────────────────────────────────────────

  _handleJump(dt, input) {
    if (this.grounded && input.isPressed('JUMP')) {
      this.vy       = PLAYER_JUMP_VELOCITY;
      this.grounded = false;
    }

    if (!this.grounded) {
      this.vy    -= GRAVITY * dt;
      this.jumpY += this.vy * dt;

      if (this.jumpY <= 0) {
        this.jumpY    = 0;
        this.vy       = 0;
        this.grounded = true;
      }
    }
  }

  // ── Combat ───────────────────────────────────────────────────────────────────

  _handleCombat(input) {
    // Placeholder: just toggle flags — combat logic comes in Phase 3
    if (input.isPressed('ATTACK'))  this.attacking = !this.attacking;
    if (input.isPressed('SPECIAL')) this.special   = !this.special;
  }
}
