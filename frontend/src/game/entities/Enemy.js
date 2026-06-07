/**
 * Enemy  (CPU-controlled)
 *
 * Takes a characterId ('katie' | 'david') so the CPU opponent
 * uses the correct sprite set and attack moves.
 *
 * AI behaviour:
 *   - Face the player at all times
 *   - Walk toward the player, stop at melee range
 *   - Drift to match the player's Z depth
 *   - Randomly execute attacks from the character's cpuAttacks list
 */

import {
  WORLD_MIN_X, WORLD_MAX_X,
  PLAYER_BASE_WIDTH, PLAYER_BASE_HEIGHT,
  PLAYER_MAX_HP, HURT_DURATION,
  ATTACK_RANGE_X, ATTACK_RANGE_Z,
} from '../constants.js';
import { AnimationController } from '../engine/AnimationSystem.js';
import { CHAR_DEFS }           from '../engine/Characters.js';

const ENEMY_SPEED      = 55;    // px/s patrol speed
const KNOCKBACK_FORCE  = 300;   // px/s applied on hit
const MELEE_DISTANCE   = ATTACK_RANGE_X * 0.75;
const ATTACK_COOLDOWN_MIN = 1.2;  // seconds between CPU attacks
const ATTACK_COOLDOWN_MAX = 2.2;

export class Enemy {
  constructor({ x = 620, z = 30, characterId = 'david' } = {}) {
    this._charDef = CHAR_DEFS[characterId] ?? CHAR_DEFS.david;

    this.x     = x;
    this.z     = z;
    this.jumpY = 0;
    this.vx    = 0;
    this.vz    = 0;

    this.hp            = PLAYER_MAX_HP;
    this.maxHp         = PLAYER_MAX_HP;
    this.pendingDamage = 0;
    this.hurt          = false;
    this.hurtTimer     = 0;
    this.facingLeft    = true;

    // ── Combo counter ─────────────────────────────────────────────────────────
    this.hitCombo      = 0;
    this.hitComboTimer = 0;

    this.baseWidth  = PLAYER_BASE_WIDTH;
    this.baseHeight = PLAYER_BASE_HEIGHT;
    this.color      = this._charDef.color;

    this.anim = new AnimationController(this._charDef);
    this._attackCooldown = ATTACK_COOLDOWN_MIN;
  }

  get currentSprite() { return this.anim.currentSprite; }
  get isDead()        { return this.hp <= 0; }

  // isBlocking is always false for CPU (no block logic yet)
  get isBlocking() { return false; }

  takeDamage(amount, attackerX = this.x - 1) {
    if (this.hurt) return;
    this.hp        = Math.max(0, this.hp - amount);
    this.hurt      = true;
    this.hurtTimer = HURT_DURATION;
    // Knockback — push away from attacker
    const dir = attackerX < this.x ? 1 : -1;
    this.vx = dir * KNOCKBACK_FORCE;
  }

  resetForRound(x = 620) {
    this.x = x; this.z = 30;
    this.vx = this.vz = 0;
    this.hp        = this.maxHp;
    this.hurt      = false; this.hurtTimer = 0;
    this.pendingDamage = 0;
    this.hitCombo  = 0; this.hitComboTimer = 0;
    this._attackCooldown = ATTACK_COOLDOWN_MIN;
    this.anim.play('idle');
  }

  update(dt, player) {
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

    // Combo timer
    if (this.hitComboTimer > 0) {
      this.hitComboTimer -= dt;
      if (this.hitComboTimer <= 0) { this.hitCombo = 0; this.hitComboTimer = 0; }
    }

    // Anim tick — sets pendingDamage on hit frames
    const { hitActive } = this.anim.update(dt);
    if (hitActive) this.pendingDamage = this.anim.currentDamage;

    if (this.anim.isFinished && this.anim.isAttacking) this.anim.play('idle');

    this._updateAI(dt, player);
    this._updateWalkAnim();
  }

  // ── CPU AI ───────────────────────────────────────────────────────────────────

  _updateAI(dt, player) {
    if (this.anim.isAttacking) { this.vx = 0; return; }

    // During hurt/knockback: let vx decay naturally, skip AI movement
    if (this.hurt) {
      const friction = 700 * dt;
      if (Math.abs(this.vx) <= friction) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * friction;
      this.x = Math.max(WORLD_MIN_X, Math.min(WORLD_MAX_X, this.x + this.vx * dt));
      return;
    }

    const dx = player.x - this.x;
    this.facingLeft = dx < 0;

    // Move toward player unless already in melee range
    if (Math.abs(dx) > MELEE_DISTANCE) {
      this.vx = Math.sign(dx) * ENEMY_SPEED;
    } else {
      this.vx = 0;
    }

    // Drift to match player Z
    const dz  = player.z - this.z;
    this.vz   = Math.sign(dz) * Math.min(Math.abs(dz) * 2, 40);

    this.x = Math.max(WORLD_MIN_X, Math.min(WORLD_MAX_X, this.x + this.vx * dt));
    this.z = Math.max(0, Math.min(60, this.z + this.vz * dt));

    // CPU attack logic
    this._attackCooldown -= dt;
    if (this._attackCooldown <= 0) {
      const inRangeX = Math.abs(dx) < ATTACK_RANGE_X;
      const inRangeZ = Math.abs(player.z - this.z) < ATTACK_RANGE_Z;
      if (inRangeX && inRangeZ) {
        const attacks = this._charDef.cpuAttacks;
        this.anim.play(attacks[Math.floor(Math.random() * attacks.length)]);
      }
      this._attackCooldown =
        ATTACK_COOLDOWN_MIN + Math.random() * (ATTACK_COOLDOWN_MAX - ATTACK_COOLDOWN_MIN);
    }
  }

  _updateWalkAnim() {
    if (this.anim.isAttacking) return;
    const moving = Math.abs(this.vx) > 4 || Math.abs(this.vz) > 4;
    if (moving  && this.anim.animName !== 'walk') this.anim.play('walk');
    if (!moving && this.anim.animName !== 'idle') this.anim.play('idle');
  }
}
