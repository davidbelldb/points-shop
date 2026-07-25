#!/usr/bin/env node
/**
 * Build the full crow tamagotchi sprite set from crow/manifest.json.
 *
 *   export PIXELLAB_TOKEN="..."
 *   node crow/build-sprites.mjs --plan     # free: show build order + cost, generate nothing
 *   node crow/build-sprites.mjs            # build everything missing
 *   node crow/build-sprites.mjs --only=crow,food
 *   node crow/build-sprites.mjs --redo=adult_happy,elder_idle
 *
 * Safe to re-run: existing PNGs are skipped, so a crash or Ctrl-C costs nothing.
 * Sprites land in crow/sprites/<group>/<id>.png with an index.json alongside.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://api.pixellab.ai/v2';
const TOKEN = process.env.PIXELLAB_TOKEN;
const ROOT = dirname(fileURLToPath(import.meta.url));
const SPRITES = join(ROOT, 'sprites');
const CONCURRENCY = 4;

const argv = process.argv.slice(2);
const PLAN = argv.includes('--plan');
const flag = (n) => (argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1] || '';
const ONLY = flag('only').split(',').filter(Boolean);
const REDO = flag('redo').split(',').filter(Boolean);
const PICK = flag('pick').split(',').filter(Boolean);

if (!TOKEN && !PLAN) {
  console.error('Missing PIXELLAB_TOKEN.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const { style, palette, sprites } = manifest;
const byId = new Map(sprites.map((s) => [s.id, s]));

const pathFor = (s) => join(SPRITES, s.group, `${s.id}.png`);
const REDO_ALL = REDO.includes('all');
const done = (s) => existsSync(pathFor(s)) && !REDO_ALL && !REDO.includes(s.id);

/* ---------------------------------------------------------------- *
 * Build order: a sprite with a `ref` must come after its reference.
 * ---------------------------------------------------------------- */
function buildOrder() {
  const out = [];
  const state = new Map(); // id -> 'visiting' | 'done'
  const visit = (id, trail = []) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') throw new Error(`circular ref: ${[...trail, id].join(' -> ')}`);
    const s = byId.get(id);
    if (!s) throw new Error(`unknown ref "${id}" (from ${trail.at(-1) || 'root'})`);
    state.set(id, 'visiting');
    if (s.ref) visit(s.ref, [...trail, id]);
    state.set(id, 'done');
    out.push(s);
  };
  for (const s of sprites) visit(s.id);
  return out;
}

/* ---------------------------------------------------------------- *
 * HTTP
 * ---------------------------------------------------------------- */
async function api(path, { method = 'GET', body } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(BASE + path, {
      method,
      headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    if (res.ok) return json;
    // Back off on rate limit / transient server errors, fail fast on bad requests.
    if (res.status === 429 || res.status >= 500) {
      await sleep(4000 * (attempt + 1));
      continue;
    }
    const err = new Error(`${method} ${path} -> ${res.status}`);
    err.detail = json;
    throw err;
  }
  throw new Error(`${method} ${path} failed after retries`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function resolveResult(res, label) {
  let payload = res;
  const jobId = res?.job_id ?? res?.id ?? res?.background_job_id;
  if (!findBase64(res) && jobId) {
    for (let i = 0; i < 120; i++) {
      await sleep(5000);
      const job = await api(`/background-jobs/${jobId}`);
      if (findBase64(job)) {
        payload = job;
        break;
      }
      const status = (job.status || job.state || '').toLowerCase();
      if (['failed', 'error', 'cancelled'].includes(status)) {
        throw new Error(`${label}: job ${status} — ${JSON.stringify(job).slice(0, 300)}`);
      }
    }
  }
  const b64 = findBase64(payload);
  if (!b64) throw new Error(`${label}: no image in response`);
  return Buffer.from(b64, 'base64');
}

/* ---------------------------------------------------------------- *
 * One sprite
 * ---------------------------------------------------------------- */
async function generate(s) {
  const [width, height] = s.size;
  const body = {
    ...style,
    description: `${s.prompt}, ${palette}`,
    image_size: { width, height },
    no_background: true,
    text_guidance_scale: 8,
    seed: s.seed,
  };

  // Icons read better flat and head-on than in a side "camera" view.
  if (s.group === 'icon') {
    body.view = 'high top-down';
    body.shading = 'flat shading';
    body.detail = 'low detail';
    delete body.direction;
  }
  // Objects have no facing; only the crow does.
  if (s.group !== 'crow') delete body.direction;

  if (s.ref) {
    const refPath = pathFor(byId.get(s.ref));
    if (!existsSync(refPath)) throw new Error(`${s.id}: reference ${s.ref} not built yet`);
    body.init_image = { type: 'base64', base64: readFileSync(refPath).toString('base64') };
    body.init_image_strength = s.strength ?? 400;
  }

  const res = await api('/create-image-pixflux', { method: 'POST', body });
  const buf = await resolveResult(res, s.id);
  mkdirSync(dirname(pathFor(s)), { recursive: true });
  writeFileSync(pathFor(s), buf);
  return buf.length;
}

/* ---------------------------------------------------------------- *
 * Runner. Sprites with no unbuilt dependency run in parallel;
 * dependents wait for their reference to land.
 * ---------------------------------------------------------------- */
async function main() {
  let order = buildOrder().filter((s) => !ONLY.length || ONLY.includes(s.group));

  // --pick keeps the named sprites plus whatever they depend on.
  if (PICK.length) {
    const keep = new Set();
    const pull = (id) => {
      if (keep.has(id)) return;
      const s = byId.get(id);
      if (!s) throw new Error(`--pick: unknown sprite "${id}"`);
      keep.add(id);
      if (s.ref) pull(s.ref);
    };
    PICK.forEach(pull);
    order = order.filter((s) => keep.has(s.id));
  }
  const todo = order.filter((s) => !done(s));

  console.log(`Manifest: ${order.length} sprites — ${order.length - todo.length} already built, ${todo.length} to generate.\n`);
  const groups = {};
  for (const s of todo) groups[s.group] = (groups[s.group] || 0) + 1;
  for (const [g, n] of Object.entries(groups)) console.log(`  ${g.padEnd(8)} ${n}`);

  if (PLAN) {
    console.log('\nBuild order:');
    todo.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s.id}${s.ref ? `  <- ${s.ref}` : ''}`));
    console.log('\n--plan: nothing generated.');
    return;
  }
  if (!todo.length) return console.log('\nNothing to do.');

  const bal = await api('/balance');
  if (bal.subscription?.generations !== undefined) {
    console.log(`\n${bal.subscription.generations} generations available, ${todo.length} needed.`);
    if (bal.subscription.generations < todo.length) {
      console.error('Not enough generations remaining. Aborting.');
      process.exit(1);
    }
  }

  const pending = new Set(todo.map((s) => s.id));
  const failures = [];
  let completed = 0;
  const queue = [...todo];
  const inflight = new Set();

  const ready = (s) => !s.ref || (!pending.has(s.ref) && existsSync(pathFor(byId.get(s.ref))));

  async function worker() {
    for (;;) {
      const i = queue.findIndex((s) => ready(s));
      if (i === -1) {
        if (!queue.length) return;
        if (!inflight.size) {
          // Nothing runnable and nothing running: the rest are blocked by failures.
          queue.splice(0).forEach((s) => failures.push([s.id, 'blocked by a failed reference']));
          return;
        }
        await sleep(2000);
        continue;
      }
      const s = queue.splice(i, 1)[0];
      inflight.add(s.id);
      try {
        await generate(s);
        completed++;
        console.log(`  [${String(completed).padStart(2)}/${todo.length}] ${s.id}`);
      } catch (e) {
        failures.push([s.id, e.message]);
        console.log(`  [fail] ${s.id}: ${e.message}`);
      } finally {
        inflight.delete(s.id);
        pending.delete(s.id);
      }
    }
  }

  console.log('\nGenerating...\n');
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Index for the Swift side to consume.
  const built = order.filter((s) => existsSync(pathFor(s)));
  mkdirSync(SPRITES, { recursive: true });
  writeFileSync(
    join(SPRITES, 'index.json'),
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        canvas: { authored: [104, 124], watch46mm: [416, 496], watch42mm: [374, 446], scale: 4 },
        sprites: built.map((s) => ({ id: s.id, group: s.group, size: s.size, file: `${s.group}/${s.id}.png` })),
      },
      null,
      2
    )
  );

  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\nBuilt ${completed}/${todo.length} in ${mins} min. Index: sprites/index.json`);
  if (failures.length) {
    console.log('\nFailures (re-run to retry, they are simply missing):');
    for (const [id, msg] of failures) console.log(`  ${id}: ${msg}`);
  }
}

main().catch((e) => {
  console.error('\nFAILED:', e.message);
  if (e.detail) console.error(JSON.stringify(e.detail, null, 2).slice(0, 1500));
  process.exit(1);
});
