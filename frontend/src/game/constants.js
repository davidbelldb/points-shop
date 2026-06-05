// ─── Canvas & Viewport ────────────────────────────────────────────────────────
export const CANVAS_WIDTH  = 800;
export const CANVAS_HEIGHT = 450;

// ─── Side-on street layout ────────────────────────────────────────────────────
// The view is a flat side-on perspective — building facade fills the back,
// player walks on a narrow pavement lane, road runs left-right at their feet.
//
//   y=0 → 300  : building facade (background)
//   y=300       : wall / top of pavement lane
//   y=300 → 378 : pavement  ← playable depth lane
//   y=378 → 392 : kerb
//   y=392 → 450 : road surface (partial, decorative)
//
export const ROAD_TOP_Y    = 300;   // back of pavement (base of building wall)
export const ROAD_BOTTOM_Y = 378;   // front of pavement / kerb line

// ─── World Bounds ─────────────────────────────────────────────────────────────
export const WORLD_MIN_Z = 0;
export const WORLD_MAX_Z = 60;    // shallow lane — 78 screen-px maps to 60 world units
export const WORLD_MIN_X = 20;
export const WORLD_MAX_X = 780;

// ─── Player Physics ───────────────────────────────────────────────────────────
export const PLAYER_ACCEL        = 900;
export const PLAYER_FRICTION     = 700;
export const PLAYER_MAX_SPEED_X  = 260;
export const PLAYER_MAX_SPEED_Z  = 120;  // slower up/down — lane is tight

export const PLAYER_JUMP_VELOCITY = 480;
export const GRAVITY              = 1100;

// ─── Player Sprite ────────────────────────────────────────────────────────────
export const PLAYER_BASE_WIDTH  = 36;
export const PLAYER_BASE_HEIGHT = 68;
export const PLAYER_SCALE_FAR   = 0.82; // subtle scale difference back→front

// ─── Timing ───────────────────────────────────────────────────────────────────
export const MAX_DELTA = 1 / 20;
