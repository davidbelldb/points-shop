/**
 * Player Entity
 *
 * Coordinate system
 * ─────────────────
 *  x      – horizontal position along the street
 *  z      – depth into the lane  (0 = back, WORLD_MAX_Z = front)
 *  jumpY  – vertical offset from jumping (px, > 0 = airborne)
 *
 * Animation is driven by AnimationController.  During an attack animation
 * horizontal/depth input is suppressed so swings feel committed.
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
import { AnimationController, ANIM } from '../engine/AnimationSystem.js';

export class Player {
  constructor({ x = 400, z = 30 } = {}) {
    // ── World position ──────────────────────────────────────────────────────
    this.x     = x;
    this.z     = z;
    this.jumpY = 0;

    // ── Velocity ────────────────────────────────────────────────────────────
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;

    // ── State ───────────────────────────────────────────────────────────────
    this.grounded   = true;
    this.facingLeft = false;

    // ── Animation ────────────────────────────────────────────────────────────
    this.anim = new AnimationController();

    // ── Combat stats ─────────────────────────────────────────────────────────
    this.hp      = 100;
    this.maxHp   = 100;
    /** Damage dealt by the last hit-frame (consumed by combat system). */
    this.pendingDamage = 0;

    // ── Sprite (fallback colour if sprites not loaded) ───────────────────────
    this.baseWidth  = PLAYER_BASE_WIDTH;
    this.baseHeight = PLAYER_BASE_HEIGHT;
    this.color      = '#4ade80';
  }

  // ── Convenience: expose current sprite key for the Renderer ─────────────────
  get currentSprite() { return this.anim.currentSprite; }

  // ── Main update ─────────────────────────────────────────────────────────────

  update(dt, input) {
    const { hitActive } = this.anim.update(dt);
    if (hitActive) {
      this.pendingDamage = ANIM[this.anim.animName]?.damage ?? 0;
    }

    // Return to idle/walk once an attack finishes
    if (this.anim.isFinished && this.anim.isAttacking) {
      this.anim.play('idle');
    }

    // Jump state drives anim if not attacking
    if (!this.anim.isAttacking) {
      if (!this.grounded) {
        if (this.anim.animName !== 'jump') this.anim.play('jump');
      }
    }

    this._handleAttacks(input);
    this._handleMovement(dt, input);
    this._handleJump(dt, input);
    this._handleWalkAnim(input);
  }

  // ── Attacks ──────────────────────────────────────────────────────────────────

  _handleAttacks(input) {
    // Only start a new attack when grounded and not mid-attack
    if (this.anim.isAttacking) return;

    if (input.isPressed('POWER_KICK')) { this.anim.play('power_kick'); return; }
    if (input.isPressed('COMBO'))      { this.anim.play('combo');      return; }
    if (input.isPressed('PUNCH'))      { this.anim.play('punch');      return; }
    if (input.isPressed('KICK'))       { this.anim.play('kick');       return; }
  }

  // ── Movement ─────────────────────────────────────────────────────────────────

  _handleMovement(dt, input) {
    // Suppress movement during attack animations
    if (this.anim.isAttacking) {
      this._applyFriction(dt);
      this._clampAndApply(dt);
      return;
    }

    const left  = input.isHeld('LEFT');
    const right = input.isHeld('RIGHT');
    const up    = input.isHeld('UP');
    const down  = input.isHeld('DOWN');

    if (left || right) {
      this.vx += (right ? 1 : -1) * PLAYER_ACCEL * dt;
      this.vx  = Math.max(-PLAYER_MAX_SPEED_X, Math.min(PLAYER_MAX_SPEED_X, this.vx));
      this.facingLeft = left;
    } else {
      this._applyFrictionAxis('x', dt);
    }

    if (up || down) {
      this.vz += (down ? 1 : -1) * PLAYER_ACCEL * dt;
      this.vz  = Math.max(-PLAYER_MAX_SPEED_Z, Math.min(PLAYER_MAX_SPEED_Z, this.vz));
    } else {
      this._applyFrictionAxis('z', dt);
    }

    this._clampAndApply(dt);
  }

  _applyFriction(dt) {
    this._applyFrictionAxis('x', dt);
    this._applyFrictionAxis('z', dt);
  }

  _applyFrictionAxis(axis, dt) {
    const delta = PLAYER_FRICTION * dt;
    if (Math.abs(this[`v${axis}`]) <= delta) this[`v${axis}`] = 0;
    else this[`v${axis}`] -= Math.sign(this[`v${axis}`]) * delta;
  }

  _clampAndApply(dt) {
    this.x = Math.max(WORLD_MIN_X, Math.min(WORLD_MAX_X, this.x + this.vx * dt));
    this.z = Math.max(WORLD_MIN_Z, Math.min(WORLD_MAX_Z, this.z + this.vz * dt));
  }

  // ── Jump ─────────────────────────────────────────────────────────────────────

  _handleJump(dt, input) {
    if (this.grounded && input.isPressed('JUMP') && !this.anim.isAttacking) {
      this.vy       = PLAYER_JUMP_VELOCITY;
      this.grounded = false;
      this.anim.play('jump');
    }

    if (!this.grounded) {
      this.vy    -= GRAVITY * dt;
      this.jumpY += this.vy * dt;
      if (this.jumpY <= 0) {
        this.jumpY    = 0;
        this.vy       = 0;
        this.grounded = true;
        if (this.anim.animName === 'jump') this.anim.play('idle');
      }
    }
  }

  // ── Walk animation ───────────────────────────────────────────────────────────

  _handleWalkAnim(input) {
    if (this.anim.isAttacking || !this.grounded) return;

    const heldH  = input.isHeld('LEFT')    || input.isHeld('RIGHT');
    const freshH = input.isPressed('LEFT')  || input.isPressed('RIGHT');
    const heldV  = input.isHeld('UP')       || input.isHeld('DOWN');
    const moving = heldH || heldV;

    if (moving) {
      // Fresh horizontal press → restart cycle from walk_01
      // Also start walk if currently idle/other non-attack anim
      if (freshH || this.anim.animName !== 'walk') {
        this.anim.play('walk');
      }
      // Otherwise the anim advances naturally to walk_03 and holds there
    } else {
      if (this.anim.animName !== 'idle') this.anim.play('idle');
    }
  }
}
