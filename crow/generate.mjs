#!/usr/bin/env node
/**
 * PixelLab test batch — crow tamagotchi style lock.
 *
 * Run on the Mac (the Cowork sandbox has no outbound access to api.pixellab.ai):
 *   export PIXELLAB_TOKEN="your-rotated-token"
 *   node crow/generate.mjs
 *
 * Flags:
 *   --dry     probe balance + OpenAPI constraints only, spend nothing
 *   --only=box,crow,worm,weather
 *
 * Outputs PNGs to crow/out/ plus a run log at crow/out/run.json
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const BASE = 'https://api.pixellab.ai/v2';
const TOKEN = process.env.PIXELLAB_TOKEN;
const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'out');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').replace('--only=', '');
const want = (name) => !ONLY || ONLY.split(',').includes(name);

if (!TOKEN) {
  console.error('Missing PIXELLAB_TOKEN. export PIXELLAB_TOKEN="..." and re-run.');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------ *
 * Canvas spec
 * Apple Watch Series 10/11: 46mm = 416x496, 42mm = 374x446.
 * Author scenes at 104x124 -> exact 4x nearest-neighbour to 416x496.
 * On 42mm keep 4x and crop ~21px each side / ~25 top+bottom, so keep
 * the entrance hole inside the safe zone.
 * ------------------------------------------------------------------ */
const SCENE = { width: 104, height: 124 };
const SAFE_INSET = { x: 6, y: 7 }; // in authored pixels

// Entrance hole, in authored 104x124 space. Centred, upper third.
const HOLE = { cx: 52, cy: 44, r: 17 };

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */
const log = [];

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}`);
    err.status = res.status;
    err.detail = json;
    throw err;
  }
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Walk a response for the first base64 image payload, whatever the shape. */
function findBase64(obj, depth = 0) {
  if (!obj || depth > 6) return null;
  if (typeof obj === 'string') return obj.length > 512 && /^[A-Za-z0-9+/=]+$/.test(obj.slice(0, 128)) ? obj : null;
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const hit = findBase64(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof obj === 'object') {
    if (typeof obj.base64 === 'string') return obj.base64;
    for (const v of Object.values(obj)) {
      const hit = findBase64(v, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/** Some endpoints return inline, others return a job id. Handle both. */
async function resolveResult(res, label) {
  let payload = res;
  const jobId = res?.job_id ?? res?.id ?? res?.background_job_id;
  const inline = findBase64(res);

  if (!inline && jobId) {
    process.stdout.write(`  ${label}: job ${jobId} `);
    for (let i = 0; i < 120; i++) {
      await sleep(5000);
      process.stdout.write('.');
      const job = await api(`/background-jobs/${jobId}`);
      const status = (job.status || job.state || '').toLowerCase();
      if (findBase64(job)) {
        payload = job;
        break;
      }
      if (['failed', 'error', 'cancelled'].includes(status)) {
        throw new Error(`job ${jobId} ${status}: ${JSON.stringify(job).slice(0, 400)}`);
      }
    }
    process.stdout.write('\n');
  }

  const b64 = findBase64(payload);
  if (!b64) throw new Error(`no image in response for ${label}: ${JSON.stringify(payload).slice(0, 400)}`);
  return Buffer.from(b64, 'base64');
}

function save(name, buf) {
  const p = join(OUT, name);
  writeFileSync(p, buf);
  console.log(`  saved ${name} (${(buf.length / 1024).toFixed(1)} KB)`);
  return p;
}

/* ------------------------------------------------------------------ *
 * Minimal PNG writer (for the inpaint mask) — no dependencies.
 * ------------------------------------------------------------------ */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Greyscale 8-bit PNG from a width*height Uint8Array. */
function encodePng(width, height, gray) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: greyscale
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = gray[y * width + x];
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** White disc over the entrance hole, black elsewhere = "repaint only the view". */
function holeMask({ width, height }, { cx, cy, r }, feather = 2) {
  const g = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      g[y * width + x] = d <= r ? 255 : d <= r + feather ? 128 : 0;
    }
  }
  return encodePng(width, height, g);
}

/* ------------------------------------------------------------------ *
 * Prompts — deliberately verbose; style consistency lives here.
 * ------------------------------------------------------------------ */
const STYLE = 'muted earthy palette, warm wood browns, limited palette retro game sprite';
const NEGATIVE = 'text, watermark, logo, UI, border, frame, blurry, photorealistic, 3d render';

/**
 * Style enums, confirmed from the live spec. Setting these explicitly on every
 * call is what keeps 100+ assets looking like one artist drew them — leaving
 * them null lets the model drift per generation.
 *   Outline: single color black outline | single color outline | selective outline | lineless
 *   Shading: flat | basic | medium | detailed | highly detailed shading
 *   Detail:  low detail | medium detail | highly detailed
 *   View:    side | low top-down | high top-down
 */
const STYLE_PARAMS = {
  outline: 'single color black outline',
  shading: 'medium shading',
  detail: 'medium detail',
  view: 'side',
  negative_description: NEGATIVE,
};

/** Fixed seeds = reproducible reruns. Change a seed to reroll just that asset. */
const SEEDS = { box: 101, weather: 202, crow: 303, worm: 404 };

const PROMPTS = {
  box:
    'square-on perpendicular front view of the inside of a wooden bird nest box, ' +
    'flat non-isometric elevation, plank walls left right and back, plank floor, ' +
    'a round entrance hole high in the back wall showing a clear blue daytime sky over distant fields, ' +
    'empty interior with no objects, ' + STYLE,
  weather:
    'view through a round hole: heavy snowfall over a white snow-covered field, ' +
    'pale grey winter sky, distant dark conifers, falling snowflakes, ' + STYLE,
  crow:
    'side view of a small chubby black crow standing, glossy blue-black feathers, ' +
    'stout grey beak, single visible round eye with a white highlight, sturdy grey feet, ' +
    'idle standing pose facing right, cute tamagotchi pet, transparent background, ' + STYLE,
  worm:
    'a single pink earthworm curled on the ground, small game item icon, ' +
    'transparent background, ' + STYLE,
};

/* ------------------------------------------------------------------ *
 * Step 1 — balance + spec probe (free)
 * ------------------------------------------------------------------ */
async function probe() {
  const bal = await api('/balance');
  const sub = bal.subscription;
  if (sub?.generations !== undefined) {
    console.log(`Plan: ${sub.plan} — ${sub.generations} of ${sub.total} generations remaining`);
  } else {
    console.log('Balance:', JSON.stringify(bal));
  }
  log.push({ step: 'balance', bal });

  const spec = await (await fetch(`${BASE}/openapi.json`)).json();
  writeFileSync(join(OUT, 'openapi.json'), JSON.stringify(spec, null, 2));

  const interesting = [
    '/create-image-pixflux',
    '/create-image-pixflux-background',
    '/inpaint',
    '/create-character-v3',
    '/map-objects',
  ];

  const deref = (ref) => ref.split('/').slice(1).reduce((o, k) => o?.[k], spec);

  for (const path of interesting) {
    const op = spec.paths?.[path]?.post;
    if (!op) {
      console.log(`\n${path}: NOT PRESENT in spec`);
      continue;
    }
    let schema = op.requestBody?.content?.['application/json']?.schema;
    if (schema?.$ref) schema = deref(schema.$ref);
    console.log(`\n${path}`);
    for (const [k, v0] of Object.entries(schema?.properties || {})) {
      let v = v0.$ref ? deref(v0.$ref) : v0;
      const bits = [v.type || (v.anyOf ? 'anyOf' : '?')];
      if (v.enum) bits.push(`enum=${v.enum.join('|')}`);
      if (v.minimum !== undefined || v.maximum !== undefined) bits.push(`${v.minimum ?? '-'}..${v.maximum ?? '-'}`);
      if (v.default !== undefined) bits.push(`default=${JSON.stringify(v.default)}`);
      const req = (schema.required || []).includes(k) ? '*' : ' ';
      console.log(`  ${req}${k.padEnd(28)} ${bits.join('  ')}`);
    }
  }
  return spec;
}

/* ------------------------------------------------------------------ *
 * Step 2 — the four test assets
 * ------------------------------------------------------------------ */
async function run() {
  const spec = await probe();
  if (DRY) {
    console.log('\n--dry: stopping before any paid call.');
    return;
  }

  const hasBackgroundEndpoint = !!spec.paths?.['/create-image-pixflux-background'];
  const sceneEndpoint = hasBackgroundEndpoint ? '/create-image-pixflux-background' : '/create-image-pixflux';

  console.log('\nGenerating test batch...');

  // 1. Canonical box interior at watch ratio.
  let boxBuf;
  if (want('box')) {
    console.log('[1/4] box interior');
    const res = await api(sceneEndpoint, {
      method: 'POST',
      body: {
        ...STYLE_PARAMS,
        description: PROMPTS.box,
        image_size: SCENE,
        no_background: false,
        text_guidance_scale: 8,
        seed: SEEDS.box,
      },
    });
    boxBuf = await resolveResult(res, 'box');
    save('scene_box_clear_day.png', boxBuf);
  }

  // 2. Same box, weather swapped via inpaint through the hole mask.
  //    This is the consistency bet: the wood must stay pixel-identical.
  if (want('weather') && boxBuf) {
    console.log('[2/4] snow view (inpaint through hole mask)');
    const mask = holeMask(SCENE, HOLE);
    save('mask_hole.png', mask);
    const res = await api('/inpaint', {
      method: 'POST',
      body: {
        ...STYLE_PARAMS,
        description: PROMPTS.weather,
        image_size: SCENE, // inpaint caps at 200px per axis — 104x124 is fine
        inpainting_image: { type: 'base64', base64: boxBuf.toString('base64') },
        mask_image: { type: 'base64', base64: mask.toString('base64') },
        text_guidance_scale: 4, // this endpoint caps at 10, not 20
        extra_guidance_scale: 3,
        seed: SEEDS.weather,
      },
    });
    save('scene_box_snow_day.png', await resolveResult(res, 'snow'));
  }

  // 3. Adult crow, transparent, side view.
  if (want('crow')) {
    console.log('[3/4] crow adult');
    const res = await api('/create-image-pixflux', {
      method: 'POST',
      body: {
        ...STYLE_PARAMS,
        description: PROMPTS.crow,
        image_size: { width: 48, height: 48 },
        no_background: true,
        direction: 'east', // side view, facing right
        text_guidance_scale: 8,
        seed: SEEDS.crow,
      },
    });
    save('crow_adult_idle.png', await resolveResult(res, 'crow'));
  }

  // 4. One food object, to check object style matches the crow.
  if (want('worm')) {
    console.log('[4/4] earthworm');
    const res = await api('/create-image-pixflux', {
      method: 'POST',
      body: {
        ...STYLE_PARAMS,
        description: PROMPTS.worm,
        image_size: { width: 32, height: 32 },
        no_background: true,
        text_guidance_scale: 8,
        seed: SEEDS.worm,
      },
    });
    save('item_worm.png', await resolveResult(res, 'worm'));
  }

  const after = await api('/balance');
  console.log('\nBalance after:', JSON.stringify(after));
  writeFileSync(join(OUT, 'run.json'), JSON.stringify({ when: new Date().toISOString(), log, after }, null, 2));
  console.log(`\nDone. Open ${OUT}`);
}

run().catch((e) => {
  console.error('\nFAILED:', e.message);
  if (e.detail) console.error(JSON.stringify(e.detail, null, 2).slice(0, 2000));
  process.exit(1);
});
