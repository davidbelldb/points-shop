/**
 * Enemy — "David"
 *
 * Placeholder entity. Renders as a blue square until David's sprites arrive.
 * Basic AI: face the player, close the gap, stop at melee range.
 * No attacks yet — that comes with Player 2 / David's sprite set.
 */

import {
  WORLD_MIN_X, WORLD_MAX_X,
  PLAYER_BASE_WIDTH, PLAYER_BASE_HEIGHT,
  PLAYER_MAX_HP,
  HURT_DURATION,
  ATTACK_RANGE_X,
} from '../constants.js';

const ENEMY_SPEED    = 55;  // px/s patrol speed
const MELEE_DISTANCE = ATTACK_RANGE_X * 0.8;

export class Enemy {
  constructor({ x = 620, z = 30 } = {}) {
    this.x     = x;
    this.z     = z;
    this.jumpY = 0;
    this.vx    = 0;
    this.vz    = 0;

    this.hp         = PLAYER_MAX_HP;
    this.maxHp      = PLAYER_MAX_HP;
    this.hurt       = false;
    this.hurtTimer  = 0;
    this.pendingDamage = 0;
    this.facingLeft = true;

    this.baseWidth  = PLAYER_BASE_WIDTH;
    this.baseHeight = PLAYER_BASE_HEIGHT;

    // Blue square until David sprites exist
    this.color = '#40c8ff';
  }

  // Renderer looks up this key; 'david_idle' won't be in the manifest yet
  // so the renderer falls back to the coloured bounding box automatically.
  get currentSprite() { return 'david_idle'; }
  get isDead()        { return this.hp <= 0; }

  takeDamage(amount) {
    if (this.hurt) return;
    this.hp        = Math.max(0, this.hp - amount);
    this.hurt      = true;
    this.hurtTimer = HURT_DURATION;
  }

  resetForRound(x = 620) {
    this.x         = x;
    this.z         = 30;
    this.vx = this.vz = 0;
    this.hp        = this.maxHp;
    this.hurt      = false;
    this.hurtTimer = 0;
    this.pendingDamage = 0;
  }

  update(dt, player) {
    this._updateHurt(dt);
    this._updateAI(dt, player);
  }

  _updateHurt(dt) {
    if (this.hurtTimer > 0) {
      this.hurtTimer -= dt;
      if (this.hurtTimer <= 0) { this.hurt = false; this.hurtTimer = 0; }
    }
  }

  _updateAI(dt, player) {
    const dx = player.x - this.x;

    // Always face the player
    this.facingLeft = dx < 0;

    // Slowly close the gap; stop just inside melee range
    if (Math.abs(dx) > MELEE_DISTANCE) {
      this.vx = Math.sign(dx) * ENEMY_SPEED;
    } else {
      this.vx = 0;
    }

    // Drift toward player's Z depth so they share the lane
    const dz = player.z - this.z;
    this.vz  = Math.sign(dz) * Math.min(Math.abs(dz) * 2, 40);

    this.x = Math.max(WORLD_MIN_X, Math.min(WORLD_MAX_X, this.x + this.vx * dt));
    this.z = Math.max(0, Math.min(60, this.z + this.vz * dt));
  }
}
