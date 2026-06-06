/**
 * AnimationSystem
 *
 * Data-driven animation definitions.  Each entry describes a move's frames,
 * timing, damage, and which frame carries the hitbox.
 *
 * Control scheme
 * ──────────────
 *   WASD / Arrows  Move
 *   K              Jump
 *   J              Punch  (3-hit, 8 dmg)
 *   L              Kick   (2-hit, 14 dmg)
 *   U              Power Kick special  (5-hit, 38 dmg)
 *   I              Punch-Kick Combo special  (4-hit, 30 dmg)
 *
 * Animation state machine (in Player.js)
 * ───────────────────────────────────────
 *   idle / walk / jump  → interruptible by any attack
 *   attack animations   → locked until complete, then return to idle/walk
 */

/** @typedef {{ frames: string[], frameDuration: number, loop: boolean, cancellable: boolean, damage: number, hitFrame: number }} AnimDef */

/** @type {Record<string, AnimDef>} */
export const ANIM = {
  idle: {
    frames:        ['katie_idle'],
    frameDuration: 0.15,
    loop:          true,
    cancellable:   true,
    damage:        0,
    hitFrame:      -1,
  },
  walk: {
    frames:        ['katie_walk_01', 'katie_walk_02', 'katie_walk_03'],
    frameDuration: 0.13,
    loop:          true,
    cancellable:   true,
    damage:        0,
    hitFrame:      -1,
  },
  jump: {
    frames:        ['katie_jump'],
    frameDuration: 0.1,
    loop:          false,
    cancellable:   false,
    damage:        0,
    hitFrame:      -1,
  },

  // ── Light attacks ───────────────────────────────────────────────────────────
  punch: {
    frames:        ['katie_punch_01', 'katie_punch_02', 'katie_punch_03'],
    frameDuration: 0.08,
    loop:          false,
    cancellable:   false,
    damage:        8,
    hitFrame:      1,   // punch_02 is the impact frame
  },
  kick: {
    frames:        ['katie_kick_01', 'katie_kick_02'],
    frameDuration: 0.10,
    loop:          false,
    cancellable:   false,
    damage:        14,
    hitFrame:      1,   // kick_02 is the impact frame
  },

  // ── Special moves ───────────────────────────────────────────────────────────
  power_kick: {
    frames:        [
      'katie_power_kick_01', 'katie_power_kick_02', 'katie_power_kick_03',
      'katie_power_kick_04', 'katie_power_kick_05',
    ],
    frameDuration: 0.10,
    loop:          false,
    cancellable:   false,
    damage:        38,
    hitFrame:      3,   // power_kick_04 is the impact frame
  },
  combo: {
    frames:        [
      'punch_kick_combo_01', 'punch_kick_combo_02',
      'punch_kick_combo_03', 'punch_kick_combo_04',
    ],
    frameDuration: 0.09,
    loop:          false,
    cancellable:   false,
    damage:        30,
    hitFrame:      3,   // combo_04 (roundhouse) is the impact frame
  },
};

/**
 * AnimationController – one instance per entity.
 *
 * Drives the current animation forward each frame.
 * Callers read `.currentSprite` for the sprite key to render.
 */
export class AnimationController {
  constructor() {
    this.animName     = 'idle';
    this.frameIndex   = 0;
    this.frameTimer   = 0;
    this.done         = true;   // true when a non-looping anim has finished
    this._hitFired    = false;  // so damage only fires once per swing
  }

  /** Start a named animation (ignores if same anim already playing and not done). */
  play(name) {
    if (!ANIM[name]) return;
    this.animName   = name;
    this.frameIndex = 0;
    this.frameTimer = 0;
    this.done       = false;
    this._hitFired  = false;
  }

  /**
   * Advance the animation by dt seconds.
   * @returns {{ hitActive: boolean }} whether the hit-frame is active this tick
   */
  update(dt) {
    const def = ANIM[this.animName];
    if (!def) return { hitActive: false };

    this.frameTimer += dt;
    let hitActive = false;

    if (this.frameTimer >= def.frameDuration) {
      this.frameTimer -= def.frameDuration;
      const next = this.frameIndex + 1;

      if (next >= def.frames.length) {
        if (def.loop) {
          this.frameIndex = 0;
        } else {
          this.frameIndex = def.frames.length - 1;
          this.done       = true;
        }
      } else {
        this.frameIndex = next;
        // Fire hit on the exact frame transition TO the hitFrame
        if (this.frameIndex === def.hitFrame && !this._hitFired && def.damage > 0) {
          hitActive      = true;
          this._hitFired = true;
        }
      }
    }

    return { hitActive };
  }

  /** Sprite key the renderer should display. */
  get currentSprite() {
    const def = ANIM[this.animName];
    return def?.frames[this.frameIndex] ?? 'katie_idle';
  }

  /** True when a non-looping animation has played to completion. */
  get isFinished() { return this.done; }

  /** True while an attack animation is running (locks movement/input). */
  get isAttacking() {
    const name = this.animName;
    return name === 'punch' || name === 'kick' || name === 'power_kick' || name === 'combo';
  }
}
