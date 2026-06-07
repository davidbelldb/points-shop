/**
 * Player Entity  (human-controlled)
 *
 * Takes a characterId ('katie' | 'david') and drives animations,
 * movement and combat via that character's definition.
 */

import {
  WORLD_MIN_X, WORLD_MAX_X,
  WORLD_MIN_Z, WORLD_MAX_Z,
  PLAYER_ACCEL, PLAYER_FRICTION,
  PLAYER_MAX_SPEED_X, PLAYER_MAX_SPEED_Z,
  PLAYER_JUMP_VELOCITY, GRAVITY,
  PLAYER_BASE_WIDTH, PLAYER_BASE_HEIGHT,
  PLAYER_MAX_HP, HURT_DURATION,
} from '../constants.js';
import { AnimationController } from '../engine/AnimationSystem.js';
import { CHAR_DEFS }           from '../engine/Characters.js';

const KNOCKBACK_FORCE = 300; // px/s applied on hit

export class Player {
  constructor({ x = 200, z = 30, characterId = 'katie' } = {}) {
    this._charDef   = CHAR_DEFS[characterId] ?? CHAR_DEFS.katie;

    // ── World position ──────────────────────────────────────────────────────
    this.x     = x;
    this.z     = z;
    this.jumpY = 0;

    // ── Velocity ────────────────────────────────────────────────────────────
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;

    // ── State ───────────────────────────────────────────────────────────────
    this.grounded    = true;
    this.facingLeft  = false;
    this.isBlocking  = false;

    // ── Animation ────────────────────────────────────────────────────────────
    this.anim = new AnimationController(this._charDef);

    // ── Combat ───────────────────────────────────────────────────────────────
    this.hp            = PLAYER_MAX_HP;
    this.maxHp         = PLAYER_MAX_HP;
    this.pendingDamage = 0;
    this.hurt          = false;
    this.hurtTimer     = 0;

    // ── Combo counter ─────────────────────────────────────────────────────────
    this.hitCombo      = 0;
    this.hitComboTimer = 0;

    // ── Renderer ──────────────────────────────────────────────────────────────
    this.baseWidth  = PLAYER_BASE_WIDTH;
    this.baseHeight = PLAYER_BASE_HEIGHT;
    this.color      = this._charDef.color;
  }

  get currentSprite() { return this.anim.currentSprite; }
  get isDead()        { return this.hp <= 0; }

  takeDamage(amount, attackerX = this.x - 1) {
    if (this.hurt) return;
    this.hp        = Math.max(0, this.hp - amount);
    this.hurt      = true;
    this.hurtTimer = HURT_DURATION;
    // Knockback — push away from attacker
    const dir = attackerX < this.x ? 1 : -1;
    this.vx = dir * KNOCKBACK_FORCE;
  }

  resetForRound(x = 200) {
    this.x = x; this.z = 30;
    this.vx = this.vz = this.vy = 0;
    this.jumpY      = 0;
    this.grounded   = true;
    this.isBlocking = false;
    this.hp         = this.maxHp;
    this.hurt       = false; this.hurtTimer = 0;
    this.pendingDamage = 0;
    this.hitCombo   = 0; this.hitComboTimer = 0;
    this.anim.play('idle');
  }

  // ── Main update ─────────────────────────────────────────────────────────────

  update(dt, input) {
    // KO state — play ko anim, freeze all other logic
    if (this.isDead) {
      this.hurt = false;
      if (this.anim.animName !== 'ko') this.anim.play('ko');
      this.anim.update(dt);
      return;
    }

    // Hurt i-frames
    if (this.hurtTimer > 0) {
      this.hurtTimer -= dt;
      if (this.hurtTimer <= 0) { this.hurt = false; this.hurtTimer = 0; }
    }

    // Combo timer — reset count if no hit lands within window
    if (this.hitComboTimer > 0) {
      this.hitComboTimer -= dt;
      if (this.hitComboTimer <= 0) { this.hitCombo = 0; this.hitComboTimer = 0; }
    }

    const { hitActive } = this.anim.update(dt);
    if (hitActive) this.pendingDamage = this.anim.currentDamage;

    // Return to idle once an attack finishes
    if (this.anim.isFinished && this.anim.isAttacking) this.anim.play('idle');

    // Keep jump anim while airborne
    if (!this.anim.isAttacking && !this.grounded && this.anim.animName !== 'jump') {
      this.anim.play('jump');
    }

    this._handleBlocking(input);
    this._handleAttacks(input);
    this._handleMovement(dt, input);
    this._handleJump(dt, input);
    this._handleWalkAnim(input);
  }

  // ── Blocking ─────────────────────────────────────────────────────────────────

  _handleBlocking(input) {
    // Can only block on the ground and when not mid-attack
    this.isBlocking = this.grounded && !this.anim.isAttacking && input.isHeld('BLOCK');
    if (this.isBlocking && this.anim.animName !== 'block') {
      this.anim.play('block');
    }
  }

  // ── Attacks ──────────────────────────────────────────────────────────────────

  _handleAttacks(input) {
    if (this.anim.isAttacking) return;
    if (this.isBlocking) return;         // can't attack while blocking
    const map = this._charDef.inputMap;

    // Priority: O > U > I > J > L
    if (input.isPressed('PIANO')      && map.PIANO)      { this.anim.play(map.PIANO);      return; }
    if (input.isPressed('POWER_KICK') && map.POWER_KICK) { this.anim.play(map.POWER_KICK); return; }
    if (input.isPressed('COMBO')      && map.COMBO)      { this.anim.play(map.COMBO);      return; }
    if (input.isPressed('PUNCH')      && map.PUNCH)      { this.anim.play(map.PUNCH);      return; }
    if (input.isPressed('KICK')       && map.KICK)       { this.anim.play(map.KICK);       return; }
  }

  // ── Movement ─────────────────────────────────────────────────────────────────

  _handleMovement(dt, input) {
    if (this.anim.isAttacking) {
      this._applyFrictionAxis('x', dt);
      this._applyFrictionAxis('z', dt);
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
    if (this.grounded && input.isPressed('JUMP') && !this.anim.isAttacking && !this.isBlocking) {
      this.vy       = PLAYER_JUMP_VELOCITY;
      this.grounded = false;
      this.anim.play('jump');
    }
    if (!this.grounded) {
      this.vy    -= GRAVITY * dt;
      this.jumpY += this.vy * dt;
      if (this.jumpY <= 0) {
        this.jumpY = 0; this.vy = 0; this.grounded = true;
        if (this.anim.animName === 'jump') this.anim.play('idle');
      }
    }
  }

  // ── Walk animation ───────────────────────────────────────────────────────────

  _handleWalkAnim(input) {
    if (this.anim.isAttacking || !this.grounded) return;
    if (this.isBlocking) return;   // block anim already set in _handleBlocking

    const moving = input.isHeld('LEFT') || input.isHeld('RIGHT')
                || input.isHeld('UP')   || input.isHeld('DOWN');
    const freshH = input.isPressed('LEFT') || input.isPressed('RIGHT');

    if (moving) {
      if (freshH || this.anim.animName !== 'walk') this.anim.play('walk');
    } else {
      if (this.anim.animName !== 'idle') this.anim.play('idle');
    }
  }
}
