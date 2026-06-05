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
 *  screenX        = lerp(vanishX, x, t)   (slight X convergence toward horizon)
 *  screenY        = screenY_ground - jumpY * scale
 *
 * Draw order (painter's algorithm):
 *   1. Sky
 *   2. Background buildings (static for now)
 *   3. Road
 *   4. Road markings
 *   5. Entities sorted by Z (back → front)
 *   6. HUD (handled by React overlay, not here)
 */

import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  ROAD_TOP_Y, ROAD_BOTTOM_Y,
  ROAD_LEFT_FAR, ROAD_RIGHT_FAR,
  ROAD_LEFT_NEAR, ROAD_RIGHT_NEAR,
  WORLD_MAX_Z,
  PLAYER_SCALE_FAR,
  PLAYER_BASE_WIDTH, PLAYER_BASE_HEIGHT,
} from '../constants.js';

// Horizon vanishing-point X (centre of canvas)
const VANISH_X = CANVAS_WIDTH / 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lerp(a, b, t) { return a + (b - a) * t; }

/**
 * Project world (x, z, jumpY) → canvas (sx, sy, scale).
 */
export function project(x, z, jumpY = 0) {
  const t      = Math.max(0, Math.min(1, z / WORLD_MAX_Z));
  const scale  = lerp(PLAYER_SCALE_FAR, 1.0, t);
  const sx     = lerp(VANISH_X, x, t);
  const groundY = lerp(ROAD_TOP_Y, ROAD_BOTTOM_Y, t);
  const sy     = groundY - jumpY * scale;
  return { sx, sy, groundY, scale, t };
}

// ─── Renderer class ───────────────────────────────────────────────────────────

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
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

    // Sort all entities back-to-front (low Z = far = drawn first)
    const entities = [scene.player, ...(scene.entities ?? [])];
    entities.sort((a, b) => a.z - b.z);

    for (const entity of entities) {
      this._drawEntityShadow(entity);
    }
    for (const entity of entities) {
      this._drawEntity(entity);
    }
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
    // Placeholder silhouette buildings — will be replaced by parallax layers in Phase 2
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
      // Dark body
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(b.x, top, b.w, b.h);
      // Window grid
      ctx.fillStyle = 'rgba(255, 220, 80, 0.55)';
      for (let wx = b.x + 6; wx < b.x + b.w - 6; wx += 14) {
        for (let wy = top + 8; wy < ROAD_TOP_Y - 8; wy += 14) {
          if (Math.random() > 0.35) {  // some lights off
            ctx.fillRect(wx, wy, 7, 7);
          }
        }
      }
    }
  }

  _drawRoad() {
    const { ctx } = this;

    // Tarmac fill
    ctx.beginPath();
    ctx.moveTo(ROAD_LEFT_FAR,  ROAD_TOP_Y);
    ctx.lineTo(ROAD_RIGHT_FAR, ROAD_TOP_Y);
    ctx.lineTo(ROAD_RIGHT_NEAR, ROAD_BOTTOM_Y);
    ctx.lineTo(ROAD_LEFT_NEAR,  ROAD_BOTTOM_Y);
    ctx.closePath();

    const roadGrad = ctx.createLinearGradient(0, ROAD_TOP_Y, 0, ROAD_BOTTOM_Y);
    roadGrad.addColorStop(0,   '#1c1c1c');
    roadGrad.addColorStop(0.5, '#2a2a2a');
    roadGrad.addColorStop(1,   '#333333');
    ctx.fillStyle = roadGrad;
    ctx.fill();

    // Pavement / kerbs
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  _drawRoadMarkings() {
    const { ctx } = this;
    // Centre dashes using perspective lerp
    ctx.strokeStyle = '#e5e510';
    ctx.setLineDash([]);

    const DASHES = 8;
    for (let i = 0; i < DASHES; i++) {
      const t0 = i       / DASHES;
      const t1 = (i + 0.5) / DASHES;
      const x0 = lerp(VANISH_X, VANISH_X, t0); // centre line stays at vanish X
      const y0 = lerp(ROAD_TOP_Y, ROAD_BOTTOM_Y, t0);
      const y1 = lerp(ROAD_TOP_Y, ROAD_BOTTOM_Y, t1);
      const lw = lerp(1, 4, t0);
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0, y1);
      ctx.stroke();
    }
  }

  // ── Entity rendering ─────────────────────────────────────────────────────────

  _drawEntityShadow(entity) {
    const { ctx } = this;
    const { sx, groundY, scale } = project(entity.x, entity.z, 0);
    const w = entity.baseWidth  * scale;
    const shadowW = w * 1.1;
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
    const { ctx } = this;
    const { sx, sy, scale } = project(entity.x, entity.z, entity.jumpY);
    const w = entity.baseWidth  * scale;
    const h = entity.baseHeight * scale;
    const drawX = sx - w / 2;
    const drawY = sy - h;

    // Body fill
    ctx.fillStyle = entity.color ?? '#4ade80';
    ctx.fillRect(drawX, drawY, w, h);

    // Dark outline
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = Math.max(1, scale * 1.5);
    ctx.strokeRect(drawX, drawY, w, h);

    // Facing indicator (white dot on face side)
    const dotX = entity.facingLeft ? drawX + w * 0.2 : drawX + w * 0.8;
    const dotY = drawY + h * 0.2;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(dotX, dotY, Math.max(2, scale * 3), 0, Math.PI * 2);
    ctx.fill();

    // Attack flash
    if (entity.attacking) {
      ctx.fillStyle = 'rgba(255, 50, 50, 0.45)';
      ctx.fillRect(drawX, drawY, w, h);
    }

    // Special flash
    if (entity.special) {
      ctx.fillStyle = 'rgba(100, 100, 255, 0.45)';
      ctx.fillRect(drawX, drawY, w, h);
    }
  }
}
