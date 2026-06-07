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
 *   - Reactively block incoming player attacks (probability scales with difficulty)
 */

import {
  WORLD_MIN_X, WORLD_MAX_X,
  PLAYER_BASE_WIDTH, PLAYER_BASE_HEIGHT,
  PLAYER_MAX_HP, HURT_DURATION,
  ATTACK_RANGE_X, ATTACK_RANGE_Z,
} from '../constants.js';
import { AnimationController } from '../engine/AnimationSystem.js';
import { CHAR_DEFS }           from '../engine/Characters.js';

const KNOCKBACK_FORCE = 300;
const MELEE_DISTANCE  = ATTACK_RANGE_X * 0.75;

// How far away the enemy needs to be for a player attack to be a "threat"
// (slightly wider than actual hit range so reaction starts early)
const BLOCK_THREAT_RANGE = ATTACK_RANGE_X * 1.3;

// Per-difficulty tuning
const DIFF_CONFIG = {
  easy: {
    speed:         45,
    cooldownMin:   1.4,
    cooldownMax:   2.6,
    blockChance:   0.25,    // blocks 1 in 4 incoming attacks
    zDriftMax:     40,
    filterAttacks: (attacks) => attacks.filter(a => ['punch', 'kick'].includes(a)),
  },
  medium: {
    speed:         70,
    cooldownMin:   0.80,
    cooldownMax:   1.50,
    blockChance:   0.50,    // blocks 1 in 2 incoming attacks
    zDriftMax:     50,
    filterAttacks: (attacks) => attacks,
  },
  hard: {
    speed:         115,
    cooldownMin:   0.18,
    cooldownMax:   0.45,
    blockChance:   0.75,    // blocks 3 in 4 incoming attacks
    zDriftMax:     65,
    filterAttacks: (attacks) => attacks,
  },
};

export class Enemy {
  constructor({ x = 620, z = 30, characterId = 'david', difficulty = 'easy' } = {}) {
    this._charDef     = CHAR_DEFS[characterId] ?? CHAR_DEFS.david;
    const diff        = DIFF_CONFIG[difficulty] ?? DIFF_CONFIG.easy;
    this._speed       = diff.speed;
    this._cooldownMin = diff.cooldownMin;
    this._cooldownMax = diff.cooldownMax;
    this._blockChance = diff.blockChance;
    this._zDriftMax   = diff.zDriftMax;
    this._attacks     = diff.filterAttacks([...this._charDef.cpuAttacks]);

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

    // ── Combo counter ──────────────────────────────────────────────────────────
    this.hitCombo      = 0;
    this.hitComboTimer = 0;

    this.baseWidth  = PLAYER_BASE_WIDTH;
    this.baseHeight = PLAYER_BASE_HEIGHT;
    this.color      = this._charDef.color;

    this.anim = new AnimationController(this._charDef);
    this._attackCooldown = this._cooldownMin;

    // ── Block reaction state ───────────────────────────────────────────────────
    this._blocking          = false;
    this._wasPlayerAttacking = false;
  }

  get currentSprite() { return this.anim.currentSprite; }
  get isDead()        { return this.hp <= 0; }
  get isBlocking()    { return this._blocking; }

  takeDamage(amount, attackerX = this.x - 1) {
    if (this.hurt) return;
    // A successful block breaks blocking stance
    if (this._blocking) this._blocking = false;
    this.hp        = Math.max(0, this.hp - amount);
    this.hurt      = true;
    this.hurtTimer = HURT_DURATION;
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
    this._attackCooldown   = this._cooldownMin;
    this._blocking         = false;
    this._wasPlayerAttacking = false;
    this.anim.play('idle');
  }

  update(dt, player, active = true) {
    // KO state — play ko anim, freeze all other logic
    if (this.isDead) {
      this.hurt     = false;
      this._blocking = false;
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

    if (active) {
      this._updateBlockReaction(player);
      this._updateAI(dt, player);
      this._updateWalkAnim();
    } else {
      // Frozen (countdown / round-end) — halt and stand idle
      this.vx       = 0;
      this.vz       = 0;
      this._blocking = false;
      if (!this.anim.isAttacking && this.anim.animName !== 'idle') {
        this.anim.play('idle');
      }
    }
  }

  // ── Block reaction ────────────────────────────────────────────────────────────

  /**
   * Detect the leading edge of a player attack and decide whether to block.
   * Decision is made once per attack start so it feels like a reaction, not
   * a wall.  Block clears automatically when the player stops attacking.
   */
  _updateBlockReaction(player) {
    const playerAttacking = !player.isDead && !!player.anim?.isAttacking;
    const inThreatRange   = Math.abs(player.x - this.x) < BLOCK_THREAT_RANGE;

    if (playerAttacking && !this._wasPlayerAttacking) {
      // Leading edge — player just started an attack
      if (inThreatRange && !this.anim.isAttacking && !this.hurt) {
        this._blocking = Math.random() < this._blockChance;
      }
    }

    if (!playerAttacking) {
      // Player's attack finished — drop guard
      this._blocking = false;
    }

    this._wasPlayerAttacking = playerAttacking;
  }

  // ── CPU AI ────────────────────────────────────────────────────────────────────

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

    // While blocking: stand still and hold guard — don't attack or move
    if (this._blocking) {
      this.vx = 0;
      this.vz = 0;
      return;
    }

    const dx = player.x - this.x;
    this.facingLeft = dx < 0;

    // Move toward player unless already in melee range
    if (Math.abs(dx) > MELEE_DISTANCE) {
      this.vx = Math.sign(dx) * this._speed;
    } else {
      this.vx = 0;
    }

    // Drift to match player Z
    const dz = player.z - this.z;
    this.vz  = Math.sign(dz) * Math.min(Math.abs(dz) * 2, this._zDriftMax);

    this.x = Math.max(WORLD_MIN_X, Math.min(WORLD_MAX_X, this.x + this.vx * dt));
    this.z = Math.max(0, Math.min(60, this.z + this.vz * dt));

    // CPU attack logic
    this._attackCooldown -= dt;
    if (this._attackCooldown <= 0) {
      const inRangeX = Math.abs(dx) < ATTACK_RANGE_X;
      const inRangeZ = Math.abs(player.z - this.z) < ATTACK_RANGE_Z;
      if (inRangeX && inRangeZ) {
        this.anim.play(this._attacks[Math.floor(Math.random() * this._attacks.length)]);
      }
      this._attackCooldown =
        this._cooldownMin + Math.random() * (this._cooldownMax - this._cooldownMin);
    }
  }

  _updateWalkAnim() {
    if (this.anim.isAttacking) return;

    // Show block animation while blocking
    if (this._blocking) {
      if (this.anim.animName !== 'block') this.anim.play('block');
      return;
    }

    const moving = Math.abs(this.vx) > 4 || Math.abs(this.vz) > 4;
    if (moving  && this.anim.animName !== 'walk') this.anim.play('walk');
    if (!moving && this.anim.animName !== 'idle') this.anim.play('idle');
  }
}
