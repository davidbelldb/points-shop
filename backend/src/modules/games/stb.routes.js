import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { startGame, endGame, getGame } from './stb.repo.js';

const WIN_BONUS = 48;

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
  const { rows } = await query(`SELECT * FROM stb_config WHERE id = 1`);
  return rows[0] || null;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function validatePatch(patch) {
  if ('hidden_message' in patch) {
    if (typeof patch.hidden_message !== 'string' || patch.hidden_message.length !== 9) {
      return 'hidden_message must be exactly 9 characters (use _ for blank tiles)';
    }
  }
  for (const k of ['scattered_letters_back', 'scattered_letters_front']) {
    if (k in patch && (typeof patch[k] !== 'string' || patch[k].length > 8)) {
      return `${k} must be 0-8 characters (use _ for blank tiles)`;
    }
  }
  for (const k of ['felt_colour', 'frame_colour', 'tile_colour', 'ink_colour', 'dice_colour', 'pip_colour']) {
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

export default async function stbRoutes(fastify) {
  // Public config (used by game page + homepage embed)
  fastify.get('/api/games/shut-the-box/config', async () => {
    return await getConfig();
  });

  // Game state — unlimited plays
  fastify.get('/api/games/shut-the-box/state', async () => {
    return { games_used_today: 0, games_limit: null, games_remaining: null };
  });

  fastify.post('/api/games/shut-the-box/start', async (req) => {
    const meId = getEffectiveAccountId(req);
    const game = await startGame(meId);
    return game;
  });

  fastify.post('/api/games/shut-the-box/end', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { game_id, result, final_tiles_open } = req.body ?? {};
    if (!game_id) return reply.code(400).send({ error: 'game_id required' });
    if (!['win', 'loss', 'abandoned'].includes(result)) return reply.code(400).send({ error: 'invalid result' });
    const game = await getGame(game_id);
    if (!game || game.account_id !== meId) return reply.code(404).send({ error: 'Game not found' });
    if (game.ended_at) return reply.code(400).send({ error: 'Game already ended' });
    await endGame(game_id, result, Array.isArray(final_tiles_open) ? final_tiles_open : []);
    let creditedPts = 0;
    if (result === 'win') {
      await creditPts(meId, WIN_BONUS, `shut-the-box:win-${game_id}`);
      creditedPts = WIN_BONUS;
    }
    return { ok: true, credited_pts: creditedPts };
  });

  // Admin config endpoints
  fastify.get('/api/admin/shut-the-box', async (req, reply) => {
    if (req.user?.actualRole !== 'admin') return reply.code(403).send({ error: 'forbidden' });
    return await getConfig();
  });

  fastify.patch('/api/admin/shut-the-box', async (req, reply) => {
    if (req.user?.actualRole !== 'admin') return reply.code(403).send({ error: 'forbidden' });
    const patch = req.body ?? {};
    const err = validatePatch(patch);
    if (err) return reply.code(400).send({ error: err });
    const allowed = [
      'homepage_visible', 'homepage_title', 'homepage_subtitle', 'homepage_days',
      'felt_colour', 'frame_colour', 'tile_colour', 'ink_colour', 'hidden_message',
      'dice_colour', 'pip_colour', 'scattered_letters_back', 'scattered_letters_front',
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
      await query(`UPDATE stb_config SET ${updates.join(', ')} WHERE id = 1`, values);
    }
    return await getConfig();
  });
}
