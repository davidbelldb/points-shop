/**
 * Renderer
 *
 * Side-on street view — building facade fills the top ~300px, a narrow
 * pavement lane sits in front of it, and the road runs left-right along
 * the bottom edge of the canvas.
 *
 * Projection (flat, no vanishing-point X convergence)
 * ────────────────────────────────────────────────────
 *  t       = z / WORLD_MAX_Z          (0 = back of lane, 1 = front)
 *  groundY = lerp(ROAD_TOP_Y, ROAD_BOTTOM_Y, t)
 *  scale   = lerp(PLAYER_SCALE_FAR, 1.0, t)
 *  sx      = x                        (flat horizontal — no X warp)
 *  sy      = groundY - jumpY * scale
 *
 * Draw order
 * ──────────
 *   1. Building facade (sky sliver, upper floors, ground-floor shops)
 *   2. Pavement lane
 *   3. Kerb + road surface
 *   4. Entity shadows (back → front)
 *   5. Entity sprites   (back → front)
 */

import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  ROAD_TOP_Y, ROAD_BOTTOM_Y,
  WORLD_MAX_Z,
  PLAYER_SCALE_FAR,
  PLAYER_BASE_HEIGHT,
} from '../constants.js';

// ─── Layout constants (local) ─────────────────────────────────────────────────
const KERB_TOP    = ROAD_BOTTOM_Y;          // 378
const KERB_BOTTOM = KERB_TOP + 14;          // 392
const ROAD_SURFACE_BOTTOM = CANVAS_HEIGHT;  // 450

const SPRITE_DISPLAY_SCALE = 2.53;  // base display scale (10% up from 2.3)

// Fraction of sprite height where the feet land.
// Aligns foot to groundY so the character doesn't float above their shadow.
const SPRITE_FOOT_RATIO = 0.93;
// ─── Helpers ──────────────────────────────────────────────────────────────────

function lerp(a, b, t) { return a + (b - a) * t; }

export function project(x, z, jumpY = 0) {
  const t       = Math.max(0, Math.min(1, z / WORLD_MAX_Z));
  const scale   = lerp(PLAYER_SCALE_FAR, 1.0, t);
  const groundY = lerp(ROAD_TOP_Y, ROAD_BOTTOM_Y, t);
  const sx      = x;
  const sy      = groundY - jumpY * scale;
  return { sx, sy, groundY, scale, t };
}

// ─── Renderer ────────────────────────────────────────────────────────────────

export class Renderer {
  constructor(canvas, sprites = null) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.sprites = sprites;
  }

  draw(scene) {
    const { ctx } = this;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (scene.background) {
      this._drawBackgroundImage(scene.background);
    } else {
      this._drawFacade();
      this._drawPavement();
      this._drawKerb();
    }

    const entities = [scene.player, ...(scene.entities ?? [])];
    entities.sort((a, b) => a.z - b.z);

    for (const e of entities) this._drawEntityShadow(e);
    for (const e of entities) this._drawEntity(e);
  }

  /**
   * Draw a background image cover-fit to the canvas.
   * The image is centred and cropped symmetrically — no stretching.
   */
  _drawBackgroundImage(img) {
    const { ctx } = this;
    const canvasAR = CANVAS_WIDTH  / CANVAS_HEIGHT;
    const imageAR  = img.width     / img.height;

    let sx, sy, sw, sh;
    if (imageAR > canvasAR) {
      // Image is wider — fit height, crop sides
      sh = img.height;
      sw = img.height * canvasAR;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      // Image is taller — fit width, crop top/bottom
      sw = img.width;
      sh = img.width / canvasAR;
      sx = 0;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // The background image has a yellow kerb line at canvas y≈378–382.
    // Overdraw it with a colour-matched strip so it doesn't read as a UI boundary.
    ctx.fillStyle = 'rgb(68, 62, 60)';
    ctx.fillRect(0, 377, CANVAS_WIDTH, 6);
  }

  // ── Building facade ──────────────────────────────────────────────────────────

  _drawFacade() {
    const { ctx } = this;
    const W = CANVAS_WIDTH;
    const wallBottom = ROAD_TOP_Y; // 300

    // ── Sky sliver above roofline ─────────────────────────────────────────────
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 40);
    skyGrad.addColorStop(0, '#0a0818');
    skyGrad.addColorStop(1, '#1a1030');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, 40);

    // ── Main wall (two tones for depth) ───────────────────────────────────────
    const wallGrad = ctx.createLinearGradient(0, 38, 0, wallBottom);
    wallGrad.addColorStop(0,   '#1e1820');
    wallGrad.addColorStop(0.6, '#241e26');
    wallGrad.addColorStop(1,   '#2c2430');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 38, W, wallBottom - 38);

    // ── Brick texture — horizontal mortar lines ────────────────────────────────
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let y = 50; y < wallBottom - 80; y += 12) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // Vertical mortar (offset every other row)
    for (let row = 0; row < 20; row++) {
      const y = 50 + row * 12;
      const offset = (row % 2) * 40;
      for (let x = offset; x < W; x += 80) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 12); ctx.stroke();
      }
    }

    // ── Upper-floor windows (two rows) ────────────────────────────────────────
    this._drawWindowRow(60,  130, 8, 52, 62);
    this._drawWindowRow(150, 220, 8, 52, 62);

    // ── Ground-floor shop fronts ───────────────────────────────────────────────
    this._drawShops(wallBottom);

    // ── Roofline detail ────────────────────────────────────────────────────────
    ctx.fillStyle = '#0f0c18';
    ctx.fillRect(0, 36, W, 6);
    // Roof lip highlight
    ctx.fillStyle = 'rgba(255,220,120,0.08)';
    ctx.fillRect(0, 36, W, 2);
  }

  /** Draw a horizontal row of windows. */
  _drawWindowRow(yTop, yBottom, count, winW, winH) {
    const { ctx } = this;
    const gap   = (CANVAS_WIDTH - count * winW) / (count + 1);
    const yMid  = yTop + (yBottom - yTop) / 2;
    const yWin  = yMid - winH / 2;

    for (let i = 0; i < count; i++) {
      const x = gap + i * (winW + gap);
      const lit = Math.random() > 0.3;

      // Frame
      ctx.fillStyle = '#18141c';
      ctx.fillRect(x - 2, yWin - 2, winW + 4, winH + 4);

      if (lit) {
        // Warm window glow
        const glow = ctx.createLinearGradient(x, yWin, x, yWin + winH);
        glow.addColorStop(0, '#ffe898');
        glow.addColorStop(1, '#d4a030');
        ctx.fillStyle = glow;
        ctx.fillRect(x, yWin, winW, winH);

        // Reflection sheen
        ctx.fillStyle = 'rgba(255,255,220,0.45)';
        ctx.fillRect(x + 4, yWin + 4, winW * 0.35, winH * 0.4);

        // Ambient glow on wall
        const radial = ctx.createRadialGradient(
          x + winW / 2, yWin + winH / 2, 0,
          x + winW / 2, yWin + winH / 2, winW * 0.9
        );
        radial.addColorStop(0, 'rgba(255,200,60,0.12)');
        radial.addColorStop(1, 'rgba(255,200,60,0)');
        ctx.fillStyle = radial;
        ctx.fillRect(x - winW, yWin - winH * 0.5, winW * 3, winH * 2);
      } else {
        ctx.fillStyle = '#0c0a10';
        ctx.fillRect(x, yWin, winW, winH);
      }
    }
  }

  /** Draw ground-floor shop fronts. */
  _drawShops(wallBottom) {
    const { ctx } = this;
    const shopTop  = 228;
    const shops = [
      { label: 'FRESH CUTS',  awning: '#c03030', neon: '#ff6080' },
      { label: 'LUCKY STAR',  awning: '#1a4488', neon: '#40c8ff' },
      { label: 'NIGHT OWL',   awning: '#3a1860', neon: '#c060ff' },
      { label: 'NOODLE KING', awning: '#882808', neon: '#ff9030' },
    ];
    const shopW = CANVAS_WIDTH / shops.length;

    shops.forEach((shop, i) => {
      const x = i * shopW;

      // ── Shop recess ───────────────────────────────────────────────────────
      ctx.fillStyle = '#100c14';
      ctx.fillRect(x + 8, shopTop, shopW - 16, wallBottom - shopTop);

      // ── Awning ────────────────────────────────────────────────────────────
      const aw = shopW - 16;
      ctx.fillStyle = shop.awning;
      ctx.beginPath();
      ctx.moveTo(x + 8,      shopTop);
      ctx.lineTo(x + 8 + aw, shopTop);
      ctx.lineTo(x + 8 + aw + 10, shopTop + 22);
      ctx.lineTo(x + 8 - 10, shopTop + 22);
      ctx.closePath();
      ctx.fill();
      // Awning stripes
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      for (let s = 0; s < aw; s += 14) {
        ctx.beginPath();
        ctx.moveTo(x + 8 + s,      shopTop);
        ctx.lineTo(x + 8 + s + 7,  shopTop);
        ctx.lineTo(x + 8 + s + 17, shopTop + 22);
        ctx.lineTo(x + 8 + s + 10, shopTop + 22);
        ctx.closePath();
        ctx.fill();
      }
      // Awning fringe
      ctx.strokeStyle = shop.awning;
      ctx.lineWidth = 3;
      const fringeY = shopTop + 22;
      for (let f = x + 8; f < x + shopW - 8; f += 10) {
        ctx.beginPath();
        ctx.moveTo(f + 5, fringeY);
        ctx.lineTo(f + 5, fringeY + 8);
        ctx.stroke();
      }

      // ── Shop window ───────────────────────────────────────────────────────
      const winX = x + 18;
      const winY = shopTop + 28;
      const winW = shopW - 52;
      const winH = 56;
      // Inner glow
      const wg = ctx.createRadialGradient(
        winX + winW / 2, winY + winH / 2, 0,
        winX + winW / 2, winY + winH / 2, winW * 0.7
      );
      wg.addColorStop(0, 'rgba(255,230,160,0.22)');
      wg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = '#0e0a12';
      ctx.fillRect(winX, winY, winW, winH);
      ctx.fillStyle = wg;
      ctx.fillRect(winX, winY, winW, winH);
      // Window frame
      ctx.strokeStyle = '#2a2232';
      ctx.lineWidth = 2;
      ctx.strokeRect(winX, winY, winW, winH);

      // ── Neon sign ─────────────────────────────────────────────────────────
      ctx.save();
      ctx.shadowColor = shop.neon;
      ctx.shadowBlur  = 8;
      ctx.fillStyle   = shop.neon;
      ctx.font        = 'bold 9px monospace';
      ctx.textAlign   = 'center';
      ctx.fillText(shop.label, x + shopW / 2, shopTop + 16);
      ctx.restore();

      // ── Door ──────────────────────────────────────────────────────────────
      const doorX = x + shopW - 30;
      const doorW = 18;
      const doorH = wallBottom - shopTop - 28;
      ctx.fillStyle = '#080610';
      ctx.fillRect(doorX, wallBottom - doorH, doorW, doorH);
      ctx.strokeStyle = '#2a2030';
      ctx.lineWidth = 1;
      ctx.strokeRect(doorX, wallBottom - doorH, doorW, doorH);
      // Door handle
      ctx.fillStyle = '#806040';
      ctx.beginPath();
      ctx.arc(doorX + 4, wallBottom - doorH / 2, 2, 0, Math.PI * 2);
      ctx.fill();

      // ── Shop divider ──────────────────────────────────────────────────────
      ctx.strokeStyle = '#0a0810';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + shopW - 0.5, shopTop);
      ctx.lineTo(x + shopW - 0.5, wallBottom);
      ctx.stroke();
    });

    // ── Wall base / dado rail ─────────────────────────────────────────────────
    ctx.fillStyle = '#1a1520';
    ctx.fillRect(0, wallBottom - 8, CANVAS_WIDTH, 8);
    ctx.fillStyle = 'rgba(255,220,100,0.06)';
    ctx.fillRect(0, wallBottom - 8, CANVAS_WIDTH, 2);
  }

  // ── Pavement ─────────────────────────────────────────────────────────────────

  _drawPavement() {
    const { ctx } = this;
    const W = CANVAS_WIDTH;

    // Base slab — slight gradient front to back
    const pg = ctx.createLinearGradient(0, ROAD_TOP_Y, 0, KERB_TOP);
    pg.addColorStop(0, '#3a3540');
    pg.addColorStop(1, '#4a4550');
    ctx.fillStyle = pg;
    ctx.fillRect(0, ROAD_TOP_Y, W, KERB_TOP - ROAD_TOP_Y);

    // Horizontal tile joints
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth   = 1;
    const tileH = (KERB_TOP - ROAD_TOP_Y) / 3;
    for (let i = 1; i < 3; i++) {
      const y = ROAD_TOP_Y + i * tileH;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // Vertical tile joints
    for (let x = 80; x < W; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, ROAD_TOP_Y); ctx.lineTo(x, KERB_TOP); ctx.stroke();
    }

    // Highlight at the top edge (wall meets pavement)
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, ROAD_TOP_Y, W, 2);
  }

  // ── Kerb + road ───────────────────────────────────────────────────────────────

  _drawKerb() {
    const { ctx } = this;
    const W = CANVAS_WIDTH;

    // Kerb face
    const kg = ctx.createLinearGradient(0, KERB_TOP, 0, KERB_BOTTOM);
    kg.addColorStop(0, '#5a5565');
    kg.addColorStop(1, '#2e2a34');
    ctx.fillStyle = kg;
    ctx.fillRect(0, KERB_TOP, W, KERB_BOTTOM - KERB_TOP);

    // Kerb highlight edge
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, KERB_TOP, W, 2);

    // Road surface
    ctx.fillStyle = '#1a1820';
    ctx.fillRect(0, KERB_BOTTOM, W, ROAD_SURFACE_BOTTOM - KERB_BOTTOM);

    // Yellow kerb markings
    ctx.strokeStyle = '#e8c820';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(0, KERB_TOP + 2);
    ctx.lineTo(W, KERB_TOP + 2);
    ctx.stroke();

    // Road lane line (white dashes, runs left-right at bottom)
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth   = 2;
    ctx.setLineDash([30, 20]);
    const laneY = KERB_BOTTOM + (ROAD_SURFACE_BOTTOM - KERB_BOTTOM) * 0.45;
    ctx.beginPath();
    ctx.moveTo(0, laneY);
    ctx.lineTo(W, laneY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Entity rendering ──────────────────────────────────────────────────────────

  _drawEntityShadow(entity) {
    // Only draw shadow when airborne — on the ground it creates a floating illusion
    if (!entity.jumpY || entity.jumpY <= 0) return;

    const { ctx }  = this;
    const { sx, groundY, scale } = project(entity.x, entity.z, 0);
    const sw = entity.baseWidth * scale * 1.2;
    const sh = sw * 0.2;

    // Shadow fades and shrinks as the entity rises
    const heightRatio = Math.max(0, 1 - entity.jumpY / 200);
    ctx.save();
    ctx.globalAlpha = 0.45 * scale * heightRatio;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(sx, groundY, (sw / 2) * heightRatio, (sh / 2) * heightRatio, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawEntity(entity) {
    const { sx, sy, groundY, scale } = project(entity.x, entity.z, entity.jumpY);
    const key    = entity.currentSprite ?? 'katie_idle';
    const sprite = this.sprites?.get(key) ?? null;

    if (sprite) {
      this._drawSprite(sprite, sx, groundY, scale, entity.facingLeft, entity);
    } else {
      this._drawEntityBox(entity, sx, sy, scale);
    }
  }

  _drawSprite(img, sx, groundY, scale, facingLeft, entity) {
    const { ctx } = this;
    const drawH = PLAYER_BASE_HEIGHT * SPRITE_DISPLAY_SCALE * scale;
    const drawW = drawH * (img.width / img.height);
    // Anchor the foot (SPRITE_FOOT_RATIO down the sprite) to groundY, then lift by jumpY
    const jumpOffset = entity.jumpY * scale * SPRITE_DISPLAY_SCALE * 0.5;
    const drawY = groundY - drawH * SPRITE_FOOT_RATIO - jumpOffset;

    ctx.save();
    if (facingLeft) {
      ctx.translate(sx, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -drawW / 2, drawY, drawW, drawH);
    } else {
      ctx.drawImage(img, sx - drawW / 2, drawY, drawW, drawH);
    }
    ctx.restore();
  }

  _drawEntityBox(entity, sx, sy, scale) {
    const { ctx } = this;
    const w = entity.baseWidth  * scale;
    const h = entity.baseHeight * scale;
    ctx.fillStyle   = entity.color ?? '#4ade80';
    ctx.fillRect(sx - w / 2, sy - h, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth   = Math.max(1, scale * 1.5);
    ctx.strokeRect(sx - w / 2, sy - h, w, h);
    const dotX = entity.facingLeft ? sx - w * 0.3 : sx + w * 0.3;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(dotX, sy - h * 0.8, Math.max(2, scale * 3), 0, Math.PI * 2);
    ctx.fill();
  }
}
