/**
 * AnimationSystem
 *
 * AnimationController drives a single entity's animation state.
 * It is initialised with a character definition from Characters.js
 * so sprite keys and timing are character-specific.
 *
 * Usage:
 *   import { CHAR_DEFS } from './Characters.js';
 *   const anim = new AnimationController(CHAR_DEFS.katie);
 *   anim.play('punch');
 *   const { hitActive } = anim.update(dt);
 *   ctx.drawImage(sprites.get(anim.currentSprite), ...);
 */

export class AnimationController {
  /** @param {import('./Characters.js').CharDef} charDef */
  constructor(charDef) {
    this._def       = charDef;
    this.animName   = 'idle';
    this.frameIndex = 0;
    this.frameTimer = 0;
    this.done       = false;
    this._hitFired  = false;
  }

  // ── Playback ────────────────────────────────────────────────────────────────

  play(name) {
    if (!this._def.animations[name]) return;
    this.animName   = name;
    this.frameIndex = 0;
    this.frameTimer = 0;
    this.done       = false;
    this._hitFired  = false;
  }

  /**
   * Advance by dt seconds.
   * @returns {{ hitActive: boolean }}
   */
  update(dt) {
    const anim = this._def.animations[this.animName];
    if (!anim) return { hitActive: false };

    this.frameTimer += dt;
    let hitActive = false;

    if (this.frameTimer >= anim.frameDuration) {
      this.frameTimer -= anim.frameDuration;
      const next = this.frameIndex + 1;

      if (next >= anim.frames.length) {
        if (anim.loop) {
          this.frameIndex = 0;
        } else if (anim.holdOnLast) {
          this.frameIndex = anim.frames.length - 1; // stay, never done
        } else {
          this.frameIndex = anim.frames.length - 1;
          this.done       = true;
        }
      } else {
        this.frameIndex = next;
        // Fire hit exactly once on the hitFrame
        if (
          this.frameIndex === anim.hitFrame &&
          !this._hitFired &&
          anim.damage > 0
        ) {
          hitActive      = true;
          this._hitFired = true;
        }
      }
    }

    return { hitActive };
  }

  // ── Read-only state ─────────────────────────────────────────────────────────

  /** Sprite key to pass to the renderer. */
  get currentSprite() {
    const anim = this._def.animations[this.animName];
    return anim?.frames[this.frameIndex] ?? `${this._def.prefix}_idle`;
  }

  /** True when a non-looping, non-holdOnLast anim has played to the end. */
  get isFinished()   { return this.done; }

  /** True while an attack animation is active. */
  get isAttacking()  { return this._def.animations[this.animName]?.isAttack ?? false; }

  /** Damage value of the current animation (used when hitActive fires). */
  get currentDamage(){ return this._def.animations[this.animName]?.damage ?? 0; }
}
