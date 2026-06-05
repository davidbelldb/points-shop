/**
 * Renderer
 *
 * Responsible for all canvas drawing.  Pure functions — no game state lives here.
 *
 * Perspective projection
 * ──────────────────────
 *  t = z / WORLD_MAX_Z              (0 = far, 1 = near)
 *  screenY_ground = lerp(ROAD_TOP_Y, ROAD_BOTTOM_Y, t)
 *  scale          = lerp(PLAYER_SCALE_FAR, 1.0, t)
 *  screenX        = lerp(vanishX, x, t)
 *  screenY        = screenY_ground - jumpY * scale
 *
 * Sprite drawing
 * ──────────────
 *  Each entity exposes:
 *    spriteKey(entity) → 'katie_idle' | 'katie_walk_01' | 'katie_walk_02' …
 *  The Renderer asks the SpriteManager for that image, scales it to match
 *  PLAYER_BASE_HEIGHT * 2 (2× game units = crisp pixel art), and draws it
 *  anchored at (sx, groundY) — i.e. bottom-centre of the sprite lands on
 *  the ground line.  Falls back to the coloured bounding-box when no sprite
 *  is loaded yet.
 *
 * Draw order (painter's algorithm):
 *   1. Sky
 *   2. Background buildings (static for now)
 *   3. Road
 *   4. Road markings
 *   5. Entity shadows (back → front)
 *   6. Entity sprites / boxes (back → front)
 */

import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  ROAD_TOP_Y, ROAD_BOTTOM_Y,
  ROAD_LEFT_FAR, ROAD_RIGHT_FAR,
  ROAD_LEFT_NEAR, ROAD_RIGHT_NEAR,
  WORLD_MAX_Z,
  PLAYER_SCALE_FAR,
  PLAYER_BASE_HEIGHT,
} from '../constants.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const VANISH_X = CANVAS_WIDTH / 2;

/**
 * At z = WORLD_MAX_Z (scale = 1.0) the sprite is drawn at
 * PLAYER_BASE_HEIGHT * SPRITE_DISPLAY_SCALE pixels tall.
 * 2.0 gives a nice crisp 2× upscale from game units.
 */
const SPRITE_DISPLAY_SCALE = 2.0;

// Walk animation frame duration in seconds (how long each frame is shown)
const WALK_FRAME_DURATION = 0.14;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lerp(a, b, t) { return a + (b - a) * t; }

/**
 * Project world (x, z, jumpY) → canvas (sx, sy, groundY, scale).
 */
export function project(x, z, jumpY = 0) {
  const t       = Math.max(0, Math.min(1, z / WORLD_MAX_Z));
  const scale   = lerp(PLAYER_SCALE_FAR, 1.0, t);
  const sx      = lerp(VANISH_X, x, t);
  const groundY = lerp(ROAD_TOP_Y, ROAD_BOTTOM_Y, t);
  const sy      = groundY - jumpY * scale;
  return { sx, sy, groundY, scale, t };
}

// ─── Frame selector ───────────────────────────────────────────────────────────

/**
 * Choose which sprite key to display for a given entity state.
 * Entities must expose: vx, vz, animTime, grounded, attacking, special.
 */
function spriteKeyFor(entity) {
  const isMoving = Math.abs(entity.vx) > 8 || Math.abs(entity.vz) > 8;

  if (!entity.grounded) return 'katie_idle';      // jump pose (reuse idle for now)
  if (!isMoving)        return 'katie_idle';

  // Alternate walk frames
  const frame = Math.floor(entity.animTime / WALK_FRAME_DURATION) % 2;
  return frame === 0 ? 'katie_walk_01' : 'katie_walk_02';
}

// ─── Renderer class ───────────────────────────────────────────────────────────

export class Renderer {
  /**
   * @param {HTMLCanvasElement}  canvas
   * @param {SpriteManager|null} sprites  pass null to use bounding-box fallback
   */
  constructor(canvas, sprites = null) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.sprites = sprites;
  }

  // ── Master draw ─────────────────────────────────────────────────────────────

  /** @param {{ player: Player, entities?: Entity[] }} scene */
  draw(scene) {
    const { ctx } = this;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    this._drawSky();
    this._drawBuildings();
    this._drawRoad();
    this._drawRoadMarkings();

    // Painter's algorithm: sort back-to-front by Z depth
    const entities = [scene.player, ...(scene.entities ?? [])];
    entities.sort((a, b) => a.z - b.z);

    for (const e of entities) this._drawEntityShadow(e);
    for (const e of entities) this._drawEntity(e);
  }

  // ── Background layers ────────────────────────────────────────────────────────

  _drawSky() {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, 0, 0, ROAD_TOP_Y);
    grad.addColorStop(0,   '#0f0c29');
    grad.addColorStop(0.5, '#302b63');
    grad.addColorStop(1,   '#24243e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, ROAD_TOP_Y + 10);
  }

  _drawBuildings() {
    const { ctx } = this;
    const buildings = [
      { x: 30,  w: 80,  h: 90  },
      { x: 120, w: 60,  h: 110 },
      { x: 190, w: 100, h: 75  },
      { x: 500, w: 90,  h: 100 },
      { x: 600, w: 70,  h: 85  },
      { x: 680, w: 110, h: 95  },
    ];

    for (const b of buildings) {
      const top = ROAD_TOP_Y - b.h;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(b.x, top, b.w, b.h);
      ctx.fillStyle = 'rgba(255, 220, 80, 0.55)';
      for (let wx = b.x + 6; wx < b.x + b.w - 6; wx += 14) {
        for (let wy = top + 8; wy < ROAD_TOP_Y - 8; wy += 14) {
          if (Math.random() > 0.35) ctx.fillRect(wx, wy, 7, 7);
        }
      }
    }
  }

  _drawRoad() {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(ROAD_LEFT_FAR,  ROAD_TOP_Y);
    ctx.lineTo(ROAD_RIGHT_FAR, ROAD_TOP_Y);
    ctx.lineTo(ROAD_RIGHT_NEAR, ROAD_BOTTOM_Y);
    ctx.lineTo(ROAD_LEFT_NEAR,  ROAD_BOTTOM_Y);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, ROAD_TOP_Y, 0, ROAD_BOTTOM_Y);
    grad.addColorStop(0,   '#1c1c1c');
    grad.addColorStop(0.5, '#2a2a2a');
    grad.addColorStop(1,   '#333333');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  _drawRoadMarkings() {
    const { ctx } = this;
    ctx.strokeStyle = '#e5e510';
    ctx.setLineDash([]);

    const DASHES = 8;
    for (let i = 0; i < DASHES; i++) {
      const t0 = i         / DASHES;
      const t1 = (i + 0.5) / DASHES;
      const y0 = lerp(ROAD_TOP_Y, ROAD_BOTTOM_Y, t0);
      const y1 = lerp(ROAD_TOP_Y, ROAD_BOTTOM_Y, t1);
      ctx.lineWidth = lerp(1, 4, t0);
      ctx.beginPath();
      ctx.moveTo(VANISH_X, y0);
      ctx.lineTo(VANISH_X, y1);
      ctx.stroke();
    }
  }

  // ── Entity rendering ─────────────────────────────────────────────────────────

  _drawEntityShadow(entity) {
    const { ctx } = this;
    const { sx, groundY, scale } = project(entity.x, entity.z, 0);
    const shadowW = entity.baseWidth * scale * 1.2;
    const shadowH = shadowW * 0.25;

    ctx.save();
    ctx.globalAlpha = 0.5 * scale;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(sx, groundY, shadowW / 2, shadowH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawEntity(entity) {
    const { sx, sy, groundY, scale } = project(entity.x, entity.z, entity.jumpY);
    const key    = spriteKeyFor(entity);
    const sprite = this.sprites?.get(key) ?? null;

    if (sprite) {
      this._drawSprite(sprite, sx, groundY, scale, entity.facingLeft, entity);
    } else {
      this._drawEntityBox(entity, sx, sy, scale);
    }
  }

  /**
   * Draw a sprite anchored bottom-centre at (sx, groundY).
   * Flips horizontally when facingLeft = true.
   */
  _drawSprite(img, sx, groundY, scale, facingLeft, entity) {
    const { ctx } = this;

    // Scale the sprite so its height matches PLAYER_BASE_HEIGHT * SPRITE_DISPLAY_SCALE at z=MAX_Z
    const drawH = PLAYER_BASE_HEIGHT * SPRITE_DISPLAY_SCALE * scale;
    const drawW = drawH * (img.width / img.height);

    // jumpY shifts the draw position up (shadow stays on groundY)
    const drawY = groundY - drawH - (entity.jumpY * scale * SPRITE_DISPLAY_SCALE * 0.5);

    ctx.save();

    if (facingLeft) {
      // Mirror around sx
      ctx.translate(sx, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -drawW / 2, drawY, drawW, drawH);
    } else {
      ctx.drawImage(img, sx - drawW / 2, drawY, drawW, drawH);
    }

    // Combat state overlays (tinted wash over sprite)
    if (entity.attacking || entity.special) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle   = entity.attacking ? '#ff3232' : '#6464ff';
      if (facingLeft) {
        ctx.fillRect(-drawW / 2, drawY, drawW, drawH);
      } else {
        ctx.fillRect(sx - drawW / 2, drawY, drawW, drawH);
      }
    }

    ctx.restore();
  }

  /** Fallback: coloured bounding box (used before sprites are loaded). */
  _drawEntityBox(entity, sx, sy, scale) {
    const { ctx } = this;
    const w = entity.baseWidth  * scale;
    const h = entity.baseHeight * scale;
    const x = sx - w / 2;
    const y = sy - h;

    ctx.fillStyle = entity.color ?? '#4ade80';
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth   = Math.max(1, scale * 1.5);
    ctx.strokeRect(x, y, w, h);

    const dotX = entity.facingLeft ? x + w * 0.2 : x + w * 0.8;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(dotX, y + h * 0.2, Math.max(2, scale * 3), 0, Math.PI * 2);
    ctx.fill();
  }
}
