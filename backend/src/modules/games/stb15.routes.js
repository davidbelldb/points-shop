import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

const WIN_BONUS = 64;

async function creditPts(accountId, delta, reason) {
  await query(
    `UPDATE accounts SET points_balance = points_balance + $1, updated_at = NOW() WHERE id = $2`,
    [delta, accountId],
  );
  await query(
    `INSERT INTO points_ledger (account_id, delta, reason) VALUES ($1, $2, $3)`,
    [accountId, delta, reason],
  );
}

async function getConfig() {
  const { rows } = await query(`SELECT * FROM stb15_config WHERE id = 1`);
  const cfg = rows[0] || null;
  if (!cfg) return null;
  const { rows: sets } = await query(`SELECT ord, back, front, active FROM stb15_scattered_sets ORDER BY ord`);
  cfg.scattered_sets = sets;
  const { rows: tableColours } = await query(`SELECT ord, colour, active FROM stb15_table_colours ORDER BY ord`);
  cfg.table_colours = tableColours;
  const { rows: dicePalettes } = await query(`SELECT ord, body, pip, active FROM stb15_dice_palettes ORDER BY ord`);
  cfg.dice_palettes = dicePalettes;
  const { rows: tileMessages } = await query(`SELECT ord, message, active FROM stb15_tile_messages ORDER BY ord`);
  cfg.tile_messages = tileMessages;
  return cfg;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function validatePatch(patch) {
  if ('hidden_message' in patch) {
    if (typeof patch.hidden_message !== 'string' || patch.hidden_message.length !== 15) {
      return 'hidden_message must be exactly 15 characters (use _ for blank tiles)';
    }
  }
  for (const k of ['felt_colour', 'frame_colour', 'tile_colour', 'ink_colour', 'dice_colour', 'pip_colour', 'table_colour']) {
    if (k in patch && (typeof patch[k] !== 'string' || !HEX_RE.test(patch[k]))) {
      return `${k} must be a hex colour like #15b8a6`;
    }
  }
  if ('homepage_days' in patch) {
    if (!Array.isArray(patch.homepage_days) || patch.homepage_days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return 'homepage_days must be an array of integers 0-6';
    }
  }
  if ('homepage_visible' in patch && typeof patch.homepage_visible !== 'boolean') {
    return 'homepage_visible must be a boolean';
  }
  return null;
}

function validateScatteredPatch(patch) {
  if ('back' in patch && (typeof patch.back !== 'string' || patch.back.length > 10)) {
    return 'back must be 0-10 characters (use _ for blank)';
  }
  if ('front' in patch && (typeof patch.front !== 'string' || patch.front.length > 10)) {
    return 'front must be 0-10 characters (use _ for blank)';
  }
  if ('active' in patch && typeof patch.active !== 'boolean') {
    return 'active must be a boolean';
  }
  return null;
}

async function getProps() {
  const { rows } = await query(`SELECT * FROM stb15_scene_props ORDER BY key`);
  return rows;
}

export default async function stb15Routes(fastify) {
  fastify.get('/api/games/shut-the-box-15/config', async () => {
    return await getConfig();
  });

  fastify.get('/api/games/shut-the-box-15/props', async () => {
    return await getProps();
  });

  // Admin — list all props
  fastify.get('/api/admin/shut-the-box-15/props', async (req, reply) => {
    if (req.user?.actualRole !== 'admin') return reply.code(403).send({ error: 'forbidden' });
    return await getProps();
  });

  // Admin — update one prop by key
  fastify.patch('/api/admin/shut-the-box-15/props/:key', async (req, reply) => {
    if (req.user?.actualRole !== 'admin') return reply.code(403).send({ error: 'forbidden' });
    const { key } = req.params;
    const patch = req.body ?? {};
    const updates = [];
    const values = [];
    if ('pos_x'     in patch) { values.push(Number(patch.pos_x));     updates.push(`pos_x = $${values.length}`); }
    if ('pos_y'     in patch) { values.push(Number(patch.pos_y));     updates.push(`pos_y = $${values.length}`); }
    if ('pos_z'     in patch) { values.push(Number(patch.pos_z));     updates.push(`pos_z = $${values.length}`); }
    if ('rot_x_deg' in patch) { values.push(Number(patch.rot_x_deg)); updates.push(`rot_x_deg = $${values.length}`); }
    if ('rot_y_deg' in patch) { values.push(Number(patch.rot_y_deg)); updates.push(`rot_y_deg = $${values.length}`); }
    if ('rot_z_deg' in patch) { values.push(Number(patch.rot_z_deg)); updates.push(`rot_z_deg = $${values.length}`); }
    if ('scale'     in patch) { values.push(Number(patch.scale));     updates.push(`scale = $${values.length}`); }
    if ('color_override' in patch) {
      const v = patch.color_override;
      if (v !== null && (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v))) {
        return reply.code(400).send({ error: 'color_override must be a 6-digit hex like #c8a020 or null' });
      }
      values.push(v); updates.push(`color_override = $${values.length}`);
    }
    if ('active'    in patch) {
      if (typeof patch.active !== 'boolean') return reply.code(400).send({ error: 'active must be boolean' });
      values.push(patch.active); updates.push(`active = $${values.length}`);
    }
    if (!updates.length) return reply.code(400).send({ error: 'nothing to update' });
    updates.push(`updated_at = NOW()`);
    values.push(key);
    const { rows } = await query(
      `UPDATE stb15_scene_props SET ${updates.join(', ')} WHERE key = $${values.length} RETURNING *`,
      values,
    );
    if (!rows.length) return reply.code(404).send({ error: 'prop not found' });
    return rows[0];
  });

  fastify.post('/api/games/shut-the-box-15/start', async (req) => {
    const meId = getEffectiveAccountId(req);
    const { rows } = await query(
      `INSERT INTO stb15_games (account_id) VALUES ($1) RETURNING *`,
      [meId],
    );
    return rows[0];
  });

  fastify.post('/api/games/shut-the-box-15/end', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { game_id, result, final_tiles_open } = req.body ?? {};
    if (!game_id) return reply.code(400).send({ error: 'game_id required' });
    if (!['win', 'loss', 'abandoned'].includes(result)) return reply.code(400).send({ error: 'invalid result' });
    const { rows } = await query(`SELECT * FROM stb15_games WHERE id = $1`, [game_id]);
    const game = rows[0] ?? null;
    if (!game || game.account_id !== meId) return reply.code(404).send({ error: 'Game not found' });
    if (game.ended_at) return reply.code(400).send({ error: 'Game already ended' });
    await query(
      `UPDATE stb15_games SET ended_at = NOW(), result = $1, final_tiles_open = $2 WHERE id = $3`,
      [result, Array.isArray(final_tiles_open) ? final_tiles_open : [], game_id],
    );
    let creditedPts = 0;
    if (result === 'win') {
      await creditPts(meId, WIN_BONUS, `shut-the-box-15:win-${game_id}`);
      creditedPts = WIN_BONUS;
    }
    return { ok: true, credited_pts: creditedPts };
  });

  // ── Admin ──────────────────────────────────────────────────────────────────

  fastify.get('/api/admin/shut-the-box-15', async (req, reply) => {
    if (req.user?.actualRole !== 'admin') return reply.code(403).send({ error: 'forbidden' });
    return await getConfig();
  });

  fastify.patch('/api/admin/shut-the-box-15', async (req, reply) => {
    if (req.user?.actualRole !== 'admin') return reply.code(403).send({ error: 'forbidden' });
    const patch = req.body ?? {};
    const err = validatePatch(patch);
    if (err) return reply.code(400).send({ error: err });
    const allowed = [
      'homepage_visible', 'homepage_title', 'homepage_subtitle', 'homepage_days',
      'felt_colour', 'frame_colour', 'tile_colour', 'ink_colour', 'hidden_message',
      'dice_colour', 'pip_colour', 'table_colour',
      'camera_pos_x', 'camera_pos_y', 'camera_pos_z', 'camera_fov',
      'show_debug_win',
      'night_mode_force', 'night_start_hour', 'night_end_hour',
      'night_lamp_intensity', 'night_lamp_colour', 'night_lamp_x', 'night_lamp_z',
      'night_blue_intensity', 'night_blue_colour',
      'night_ink_colour',
    ];
    const updates = [];
    const values = [];
    for (const k of allowed) {
      if (k in patch) {
        values.push(patch[k]);
        updates.push(`${k} = $${values.length}`);
      }
    }
    if (updates.length) {
      updates.push(`updated_at = NOW()`);
      await query(`UPDATE stb15_config SET ${updates.join(', ')} WHERE id = 1`, values);
    }
    return await getConfig();
  });

  fastify.patch('/api/admin/shut-the-box-15/tile-messages/:ord', async (req, reply) => {
    if (req.user?.actualRole !== 'admin') return reply.code(403).send({ error: 'forbidden' });
    const ord = Number(req.params.ord);
    if (!Number.isInteger(ord) || ord < 1 || ord > 10) return reply.code(400).send({ error: 'ord must be 1..10' });
    const patch = req.body ?? {};
    if ('message' in patch && (typeof patch.message !== 'string' || patch.message.length !== 15)) {
      return reply.code(400).send({ error: 'message must be exactly 15 characters (use _ for blank tiles)' });
    }
    if ('active' in patch && typeof patch.active !== 'boolean') {
      return reply.code(400).send({ error: 'active must be a boolean' });
    }
    const updates = [];
    const values = [];
    for (const k of ['message', 'active']) {
      if (k in patch) {
        values.push(patch[k]);
        updates.push(`${k} = $${values.length}`);
      }
    }
    if (updates.length) {
      updates.push(`updated_at = NOW()`);
      values.push(ord);
      await query(`UPDATE stb15_tile_messages SET ${updates.join(', ')} WHERE ord = $${values.length}`, values);
    }
    return await getConfig();
  });

  fastify.patch('/api/admin/shut-the-box-15/dice-palettes/:ord', async (req, reply) => {
    if (req.user?.actualRole !== 'admin') return reply.code(403).send({ error: 'forbidden' });
    const ord = Number(req.params.ord);
    if (!Number.isInteger(ord) || ord < 1 || ord > 4) return reply.code(400).send({ error: 'ord must be 1..4' });
    const patch = req.body ?? {};
    for (const k of ['body', 'pip']) {
      if (k in patch && (typeof patch[k] !== 'string' || !HEX_RE.test(patch[k]))) {
        return reply.code(400).send({ error: `${k} must be a hex like #e773b0` });
      }
    }
    if ('active' in patch && typeof patch.active !== 'boolean') {
      return reply.code(400).send({ error: 'active must be a boolean' });
    }
    const updates = [];
    const values = [];
    for (const k of ['body', 'pip', 'active']) {
      if (k in patch) {
        values.push(patch[k]);
        updates.push(`${k} = $${values.length}`);
      }
    }
    if (updates.length) {
      updates.push(`updated_at = NOW()`);
      values.push(ord);
      await query(`UPDATE stb15_dice_palettes SET ${updates.join(', ')} WHERE ord = $${values.length}`, values);
    }
    return await getConfig();
  });

  fastify.patch('/api/admin/shut-the-box-15/table-colours/:ord', async (req, reply) => {
    if (req.user?.actualRole !== 'admin') return reply.code(403).send({ error: 'forbidden' });
    const ord = Number(req.params.ord);
    if (!Number.isInteger(ord) || ord < 1 || ord > 3) return reply.code(400).send({ error: 'ord must be 1..3' });
    const patch = req.body ?? {};
    if ('colour' in patch && (typeof patch.colour !== 'string' || !HEX_RE.test(patch.colour))) {
      return reply.code(400).send({ error: 'colour must be a hex like #d3f3ea' });
    }
    if ('active' in patch && typeof patch.active !== 'boolean') {
      return reply.code(400).send({ error: 'active must be a boolean' });
    }
    const updates = [];
    const values = [];
    for (const k of ['colour', 'active']) {
      if (k in patch) {
        values.push(patch[k]);
        updates.push(`${k} = $${values.length}`);
      }
    }
    if (updates.length) {
      updates.push(`updated_at = NOW()`);
      values.push(ord);
      await query(`UPDATE stb15_table_colours SET ${updates.join(', ')} WHERE ord = $${values.length}`, values);
    }
    return await getConfig();
  });

  fastify.patch('/api/admin/shut-the-box-15/scattered-sets/:ord', async (req, reply) => {
    if (req.user?.actualRole !== 'admin') return reply.code(403).send({ error: 'forbidden' });
    const ord = Number(req.params.ord);
    if (!Number.isInteger(ord) || ord < 1 || ord > 5) return reply.code(400).send({ error: 'ord must be 1..5' });
    const patch = req.body ?? {};
    const err = validateScatteredPatch(patch);
    if (err) return reply.code(400).send({ error: err });
    const updates = [];
    const values = [];
    for (const k of ['back', 'front', 'active']) {
      if (k in patch) {
        values.push(patch[k]);
        updates.push(`${k} = $${values.length}`);
      }
    }
    if (updates.length) {
      updates.push(`updated_at = NOW()`);
      values.push(ord);
      await query(`UPDATE stb15_scattered_sets SET ${updates.join(', ')} WHERE ord = $${values.length}`, values);
    }
    return await getConfig();
  });
}
