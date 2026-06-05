// ─── Canvas & Viewport ────────────────────────────────────────────────────────
export const CANVAS_WIDTH  = 800;
export const CANVAS_HEIGHT = 450;

// ─── Road / World Projection ─────────────────────────────────────────────────
// The "road" is drawn as a trapezoid.
// Z = 0  → far (horizon),  Z = WORLD_MAX_Z → near (front of screen)
export const ROAD_TOP_Y    = 130;   // screen-Y of the far horizon line
export const ROAD_BOTTOM_Y = 390;   // screen-Y of the near edge of the road
export const ROAD_LEFT_FAR   = 220; // road left edge at horizon
export const ROAD_RIGHT_FAR  = 580; // road right edge at horizon
export const ROAD_LEFT_NEAR  = -60; // road left edge at front (bleeds off screen)
export const ROAD_RIGHT_NEAR = 860; // road right edge at front

// ─── World Bounds ─────────────────────────────────────────────────────────────
export const WORLD_MIN_Z = 0;
export const WORLD_MAX_Z = 200;   // depth units
export const WORLD_MIN_X = 20;
export const WORLD_MAX_X = 780;

// ─── Player Physics ───────────────────────────────────────────────────────────
export const PLAYER_ACCEL        = 900;   // px/s² acceleration
export const PLAYER_FRICTION     = 700;   // px/s² deceleration when no input
export const PLAYER_MAX_SPEED_X  = 260;   // px/s horizontal
export const PLAYER_MAX_SPEED_Z  = 180;   // depth-units/s vertical (road depth)

export const PLAYER_JUMP_VELOCITY = 480;  // initial jump impulse (px/s)
export const GRAVITY              = 1100; // px/s²

// ─── Player Sprite (placeholder box) ─────────────────────────────────────────
export const PLAYER_BASE_WIDTH  = 36;  // at Z = WORLD_MAX_Z (near)
export const PLAYER_BASE_HEIGHT = 68;  // at Z = WORLD_MAX_Z (near)
export const PLAYER_SCALE_FAR   = 0.55; // scale multiplier at Z = 0

// ─── Timing ───────────────────────────────────────────────────────────────────
export const MAX_DELTA = 1 / 20; // cap dt to avoid spiral of death (≈ 50ms)
