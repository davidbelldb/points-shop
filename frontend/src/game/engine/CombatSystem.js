/**
 * CombatSystem
 *
 * Each frame, checks whether an attacker's pending damage should land on
 * any target.  Hit detection is a simple proximity box — full hitboxes
 * with per-frame rects come in a later phase.
 *
 * Range: attacker must be facing the target AND within ATTACK_RANGE_X px
 * horizontally and ATTACK_RANGE_Z depth-units on the Z axis.
 */

import { ATTACK_RANGE_X, ATTACK_RANGE_Z } from '../constants.js';

export class CombatSystem {
  /**
   * @param {object}   attacker  – entity with pendingDamage, x, z, facingLeft
   * @param {object[]} targets   – entities that can take damage
   */
  checkHit(attacker, targets) {
    if (!attacker.pendingDamage || attacker.pendingDamage <= 0) return;

    for (const target of targets) {
      if (target.isDead) continue;

      const dx = target.x - attacker.x;
      const dz = Math.abs(target.z - attacker.z);

      // Attacker must be facing toward the target
      const facing = attacker.facingLeft ? dx < 0 : dx > 0;
      if (!facing) continue;

      if (Math.abs(dx) < ATTACK_RANGE_X && dz < ATTACK_RANGE_Z) {
        target.takeDamage(attacker.pendingDamage);
      }
    }

    attacker.pendingDamage = 0;
  }
}
