import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

async function getBalance(accountId) {
  const { rows } = await query(`SELECT points_balance FROM accounts WHERE id = $1`, [accountId]);
  return rows[0]?.points_balance ?? 0;
}

async function adjustPoints(accountId, delta, reason) {
  await query(
    `UPDATE accounts SET points_balance = points_balance + $1, updated_at = NOW() WHERE id = $2`,
    [delta, accountId],
  );
  await query(
    `INSERT INTO points_ledger (account_id, delta, reason) VALUES ($1, $2, $3)`,
    [accountId, delta, reason],
  );
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function getDuckyConfig() {
  const { rows: cfgRows } = await query(`SELECT * FROM ducky_config WHERE id = 1`);
  const cfg = cfgRows[0] || null;
  if (!cfg) return null;
  const { rows: ducks } = await query(`SELECT * FROM ducky_ducks ORDER BY ord`);
  const { rows: banners } = await query(`SELECT ord, text, active FROM ducky_banners ORDER BY ord`);
  const { rows: phrases } = await query(`SELECT ord, text, active FROM ducky_phrases ORDER BY ord`);
  cfg.ducks = ducks;
  cfg.banners = banners;
  cfg.phrases = phrases;
  return cfg;
}

// Generate 0-2 whirlpools at moving-progress fractions, durations included in finishMs.
function makeWhirlpools() {
  const r = Math.random();
  const count = r < 0.32 ? 0 : r < 0.82 ? 1 : 2;
  const pools = [];
  let lastAt = 0.15;
  for (let i = 0; i < count; i++) {
    const at = lastAt + 0.08 + Math.random() * (0.62 - lastAt);
    if (at > 0.85) break;
    pools.push({ at: Math.round(at * 1000) / 1000, durationMs: 900 + Math.floor(Math.random() * 900) });
    lastAt = at + 0.12;
  }
  return pools;
}

export default async function duckyRoutes(fastify) {
  // Public config (also used by the homepage embed later).
  fastify.get('/api/games/ducky/config', async () => {
    return await getDuckyConfig();
  });

  // Create a fresh lineup — races all active ducks (up to race_duck_count).
  fastify.post('/api/games/ducky/lineup', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { rows: cfgRows } = await query(`SELECT * FROM ducky_config WHERE id = 1`);
    const cfg = cfgRows[0] || { race_duck_count: 10 };
    const { rows: allDucks } = await query(`SELECT * FROM ducky_ducks WHERE active = TRUE ORDER BY ord`);
    if (allDucks.length < 2) return reply.code(400).send({ error: 'Not enough ducks configured' });

    const n = Math.max(2, Math.min(cfg.race_duck_count || 10, 10, allDucks.length));
    const racers = shuffle(allDucks).slice(0, n);
    // Odds pool: every duck's odds value shuffled and assigned regardless of speed.
    const oddsPool = shuffle(allDucks.map((d) => Number(d.odds)));
    const lineup = racers.map((d, i) => ({
      ord: d.ord,
      name: d.name,
      duck_colour: d.duck_colour,
      bill_colour: d.bill_colour,
      odds: oddsPool[i % oddsPool.length],
    }));

    const winner = lineup[Math.floor(Math.random() * lineup.length)];
    // Winner ~15-16.5s; others a modest spread behind (smooth, not extreme).
    const winMs = 15000 + Math.floor(Math.random() * 1500);
    const finishMs = {};
    const whirlpools = {};
    for (const d of lineup) {
      finishMs[d.ord] = d.ord === winner.ord
        ? winMs
        : winMs + 500 + Math.floor(Math.random() * 3400);
      whirlpools[d.ord] = makeWhirlpools();
    }

    const { rows } = await query(
      `INSERT INTO ducky_races (account_id, lineup, winner_ord, finish_ms, whirlpools)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [meId, JSON.stringify(lineup), winner.ord, JSON.stringify(finishMs), JSON.stringify(whirlpools)],
    );
    return { lineup_id: rows[0].id, ducks: lineup, balance: await getBalance(meId) };
  });

  // Place the bet and resolve the race.
  fastify.post('/api/games/ducky/race', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { lineup_id, picked_ord, stake } = req.body ?? {};
    const stakeN = Number(stake);
    if (!lineup_id) return reply.code(400).send({ error: 'lineup_id required' });
    if (!Number.isInteger(stakeN) || stakeN <= 0) {
      return reply.code(400).send({ error: 'Stake must be a positive whole number' });
    }

    const { rows } = await query(
      `SELECT * FROM ducky_races WHERE id = $1 AND account_id = $2`,
      [lineup_id, meId],
    );
    const race = rows[0];
    if (!race) return reply.code(404).send({ error: 'Lineup not found' });
    if (race.raced_at) return reply.code(400).send({ error: 'This race has already run' });

    const lineup = race.lineup;
    const picked = lineup.find((d) => d.ord === Number(picked_ord));
    if (!picked) return reply.code(400).send({ error: 'Pick a duck in the lineup' });

    const balance = await getBalance(meId);
    if (stakeN > balance) return reply.code(400).send({ error: 'Stake exceeds your balance' });

    const won = race.winner_ord === picked.ord;
    const payout = won ? Math.round(stakeN * Number(picked.odds)) : 0;

    await adjustPoints(meId, -stakeN, `ducky:stake-${race.id}`);
    if (won) await adjustPoints(meId, payout, `ducky:win-${race.id}`);

    await query(
      `UPDATE ducky_races SET stake = $1, picked_ord = $2, payout = $3, won = $4, raced_at = NOW()
        WHERE id = $5`,
      [stakeN, picked.ord, payout, won, race.id],
    );

    return {
      winner_ord: race.winner_ord,
      finish_ms: race.finish_ms,
      whirlpools: race.whirlpools,
      ducks: lineup,
      picked_ord: picked.ord,
      odds: Number(picked.odds),
      stake: stakeN,
      won,
      payout,
      balance: await getBalance(meId),
    };
  });

  /* ---- Admin ---- */
  function requireAdmin(req, reply) {
    if (req.user?.actualRole !== 'admin') { reply.code(403).send({ error: 'forbidden' }); return false; }
    return true;
  }

  fastify.get('/api/admin/games/ducky', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return await getDuckyConfig();
  });

  fastify.patch('/api/admin/games/ducky', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const p = req.body ?? {};
    if ('water_colour' in p && (typeof p.water_colour !== 'string' || !HEX_RE.test(p.water_colour))) {
      return reply.code(400).send({ error: 'water_colour must be a hex colour' });
    }
    if ('race_duck_count' in p && (!Number.isInteger(p.race_duck_count) || p.race_duck_count < 2 || p.race_duck_count > 10)) {
      return reply.code(400).send({ error: 'race_duck_count must be 2-10' });
    }
    const updates = [];
    const values = [];
    for (const k of ['water_colour', 'race_duck_count', 'homepage_visible', 'homepage_title', 'homepage_subtitle', 'homepage_days']) {
      if (k in p) { values.push(p[k]); updates.push(`${k} = $${values.length}`); }
    }
    if (updates.length) {
      updates.push('updated_at = NOW()');
      await query(`UPDATE ducky_config SET ${updates.join(', ')} WHERE id = 1`, values);
    }
    return await getDuckyConfig();
  });

  fastify.patch('/api/admin/games/ducky/ducks/:ord', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const ord = Number(req.params.ord);
    if (!Number.isInteger(ord) || ord < 1 || ord > 10) return reply.code(400).send({ error: 'ord must be 1-10' });
    const p = req.body ?? {};
    for (const k of ['duck_colour', 'bill_colour']) {
      if (k in p && (typeof p[k] !== 'string' || !HEX_RE.test(p[k]))) {
        return reply.code(400).send({ error: `${k} must be a hex colour` });
      }
    }
    if ('odds' in p && (typeof p.odds !== 'number' || p.odds <= 0 || p.odds > 999)) {
      return reply.code(400).send({ error: 'odds must be a positive number' });
    }
    const updates = [];
    const values = [];
    for (const k of ['name', 'duck_colour', 'bill_colour', 'odds', 'active']) {
      if (k in p) { values.push(p[k]); updates.push(`${k} = $${values.length}`); }
    }
    if (updates.length) {
      updates.push('updated_at = NOW()');
      values.push(ord);
      await query(`UPDATE ducky_ducks SET ${updates.join(', ')} WHERE ord = $${values.length}`, values);
    }
    return await getDuckyConfig();
  });

  async function updateRowTable(table, maxOrd, ord, patch, reply) {
    if (!Number.isInteger(ord) || ord < 1 || ord > maxOrd) {
      reply.code(400).send({ error: `ord must be 1-${maxOrd}` });
      return null;
    }
    const updates = [];
    const values = [];
    for (const k of ['text', 'active']) {
      if (k in patch) { values.push(patch[k]); updates.push(`${k} = $${values.length}`); }
    }
    if (updates.length) {
      updates.push('updated_at = NOW()');
      values.push(ord);
      await query(`UPDATE ${table} SET ${updates.join(', ')} WHERE ord = $${values.length}`, values);
    }
    return getDuckyConfig();
  }

  fastify.patch('/api/admin/games/ducky/banners/:ord', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return await updateRowTable('ducky_banners', 6, Number(req.params.ord), req.body ?? {}, reply);
  });

  fastify.patch('/api/admin/games/ducky/phrases/:ord', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return await updateRowTable('ducky_phrases', 12, Number(req.params.ord), req.body ?? {}, reply);
  });
}
