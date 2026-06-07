/**
 * CombatSystem
 *
 * Each frame, checks whether an attacker's pending damage should land on
 * any target.  Hit detection is a simple proximity box — full hitboxes
 * with per-frame rects come in a later phase.
 *
 * Range: attacker must be facing the target AND within ATTACK_RANGE_X px
 * horizontally and ATTACK_RANGE_Z depth-units on the Z axis.
 *
 * Callbacks (set externally before use):
 *   onAudio(type)              – 'punch' | 'kick' | 'special' | 'block' | 'hurt'
 *   onShake(intensity, dur)    – trigger screen shake
 */

import { ATTACK_RANGE_X, ATTACK_RANGE_Z } from '../constants.js';

// Moves that trigger screen shake and heavier audio
const HEAVY_MOVES = new Set(['power_kick', 'combo', 'piano_attack', 'special', 'guitar']);

export class CombatSystem {
  constructor() {
    this.onAudio = null;   // (type: string) => void
    this.onShake = null;   // (intensity: number, duration: number) => void
  }

  /**
   * @param {object}   attacker  – entity with pendingDamage, x, z, facingLeft, anim
   * @param {object[]} targets   – entities that can take damage
   */
  checkHit(attacker, targets) {
    if (!attacker.pendingDamage || attacker.pendingDamage <= 0) return;

    const animName = attacker.anim?.animName ?? '';
    const isHeavy  = HEAVY_MOVES.has(animName);

    for (const target of targets) {
      if (target.isDead) continue;

      const dx = target.x - attacker.x;
      const dz = Math.abs(target.z - attacker.z);

      // Attacker must be facing toward the target
      const facing = attacker.facingLeft ? dx < 0 : dx > 0;
      if (!facing) continue;

      if (Math.abs(dx) < ATTACK_RANGE_X && dz < ATTACK_RANGE_Z) {
        if (target.isBlocking) {
          // Blocked — 20% damage, block sound only
          const reduced = Math.max(1, Math.round(attacker.pendingDamage * 0.2));
          target.takeDamage(reduced, attacker.x);
          this.onAudio?.('block');
        } else {
          // Hit lands
          target.takeDamage(attacker.pendingDamage, attacker.x);

          // Impact audio — instrument-specific for piano/guitar, generic otherwise
          if (animName === 'piano_attack') {
            this.onAudio?.('piano_hit');
          } else if (animName === 'guitar') {
            this.onAudio?.('guitar_hit');
          } else if (isHeavy) {
            this.onAudio?.('special');
          } else if (animName === 'punch') {
            this.onAudio?.('punch');
          } else {
            this.onAudio?.('kick');
          }
          this.onAudio?.('hurt');

          // Screen shake on heavy moves
          if (isHeavy) {
            this.onShake?.(7, 0.28);
          }
        }
      }
    }

    attacker.pendingDamage = 0;
  }
}
