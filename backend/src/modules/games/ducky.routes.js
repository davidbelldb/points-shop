import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const BUOY_COLOURS = ['#e0322e', '#f4c020', '#39b54a']; // red, yellow, green

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
  const { rows: banners } = await query(`SELECT ord, text, active, placement, colour FROM ducky_banners ORDER BY ord`);
  const { rows: phrases } = await query(`SELECT ord, text, active FROM ducky_phrases ORDER BY ord`);
  const { rows: commentary } = await query(`SELECT ord, text, active FROM ducky_commentary ORDER BY ord`);
  cfg.ducks = ducks;
  cfg.banners = banners;
  cfg.phrases = phrases;
  cfg.commentary = commentary;
  return cfg;
}

// 0-2 whirlpools at moving-progress fractions. Each is an OSCILLATION: the duck
// idles in a slow circular drift for `loops` full loops; the time is baked into finishMs.
function makeWhirlpools() {
  const r = Math.random();
  const count = r < 0.34 ? 0 : r < 0.82 ? 1 : 2;
  const pools = [];
  let lastAt = 0.16;
  for (let i = 0; i < count; i++) {
    const at = lastAt + 0.08 + Math.random() * (0.62 - lastAt);
    if (at > 0.84) break;
    pools.push({
      at: Math.round(at * 1000) / 1000,
      durationMs: 1500 + Math.floor(Math.random() * 1700),
      loops: 1 + Math.floor(Math.random() * 3), // 1-3 oscillations
    });
    lastAt = at + 0.13;
  }
  return pools;
}

export default async function duckyRoutes(fastify) {
  fastify.get('/api/games/ducky/config', async () => {
    return await getDuckyConfig();
  });

  // Create a lineup — races all active ducks (up to race_duck_count), fractional odds
  // shuffled on, secret uniform-random winner + timings.
  fastify.post('/api/games/ducky/lineup', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { rows: cfgRows } = await query(`SELECT * FROM ducky_config WHERE id = 1`);
    const cfg = cfgRows[0] || { race_duck_count: 10 };
    const { rows: allDucks } = await query(`SELECT * FROM ducky_ducks WHERE active = TRUE ORDER BY ord`);
    if (allDucks.length < 2) return reply.code(400).send({ error: 'Not enough ducks configured' });

    const n = Math.max(2, Math.min(cfg.race_duck_count || 10, 10, allDucks.length));
    const racers = shuffle(allDucks).slice(0, n);
    const oddsPool = shuffle(allDucks.map((d) => ({ num: d.odds_num, den: d.odds_den })));
    const lineup = racers.map((d, i) => ({
      ord: d.ord,
      name: d.name,
      duck_colour: d.duck_colour,
      bill_colour: d.bill_colour,
      odds_num: oddsPool[i % oddsPool.length].num,
      odds_den: oddsPool[i % oddsPool.length].den,
    }));

    const winner = lineup[Math.floor(Math.random() * lineup.length)];
    const winMs = 25000 + Math.floor(Math.random() * 1500);

    // ~40% of races crown a "chaser" who finishes on the winner's tail — a photo finish.
    const fieldOrds = lineup.filter((d) => d.ord !== winner.ord);
    const chaserOrd = fieldOrds.length && Math.random() < 0.4
      ? fieldOrds[Math.floor(Math.random() * fieldOrds.length)].ord
      : null;

    const finishMs = {};
    const whirlpools = {}; // per-duck obstacle list (whirlpools + buoys), sorted by `at`
    const lilypads = {};
    for (const d of lineup) {
      const isWinner = d.ord === winner.ord;
      const isChaser = d.ord === chaserOrd;
      let base;
      if (isWinner) base = winMs;
      else if (isChaser) base = winMs + 200 + Math.floor(Math.random() * 380);
      else base = winMs + 700 + Math.floor(Math.random() * 3200);

      const obstacles = makeWhirlpools().map((w) => ({ ...w, kind: 'whirl' }));
      // buoys + lily pads only for the mid-field — never the winner or the chaser.
      const buoys = [];
      const pads = [];
      if (!isWinner && !isChaser) {
        const bc = Math.random() < 0.6 ? (Math.random() < 0.4 ? 2 : 1) : 0;
        for (let i = 0; i < bc; i++) {
          buoys.push({
            kind: 'buoy',
            at: Math.round((0.18 + Math.random() * 0.62) * 1000) / 1000,
            durationMs: 500 + Math.floor(Math.random() * 700),
            colour: BUOY_COLOURS[Math.floor(Math.random() * BUOY_COLOURS.length)],
            fromTop: Math.random() < 0.5,
          });
        }
        if (Math.random() < 0.5) {
          const pc = Math.random() < 0.3 ? 2 : 1;
          for (let i = 0; i < pc; i++) {
            pads.push({ at: Math.round((0.2 + Math.random() * 0.58) * 1000) / 1000 });
          }
        }
      }

      const buoyTotal = buoys.reduce((s, b) => s + b.durationMs, 0);
      let F = base + buoyTotal - pads.length * 850;
      if (!isWinner) F = Math.max(F, winMs + (isChaser ? 150 : 350));
      finishMs[d.ord] = F;
      whirlpools[d.ord] = [...obstacles, ...buoys].sort((a, b) => a.at - b.at);
      lilypads[d.ord] = pads;
    }

    // 50% chance one non-winning duck sinks partway through (never the winner/chaser).
    let sinkOrd = null;
    let sinkAt = null;
    const sinkPool = lineup.filter((d) => d.ord !== winner.ord && d.ord !== chaserOrd);
    if (sinkPool.length >= 1 && lineup.length >= 3 && Math.random() < 0.5) {
      sinkOrd = sinkPool[Math.floor(Math.random() * sinkPool.length)].ord;
      sinkAt = Math.round((0.35 + Math.random() * 0.4) * 1000) / 1000; // 0.35-0.75
    }

    const { rows } = await query(
      `INSERT INTO ducky_races (account_id, lineup, winner_ord, finish_ms, whirlpools, lilypads, sink_ord, sink_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [meId, JSON.stringify(lineup), winner.ord, JSON.stringify(finishMs), JSON.stringify(whirlpools), JSON.stringify(lilypads), sinkOrd, sinkAt],
    );
    return { lineup_id: rows[0].id, ducks: lineup, balance: await getBalance(meId) };
  });

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
    // Fractional odds: total return = stake * (num/den + 1).
    const mult = picked.odds_num / picked.odds_den + 1;
    const payout = won ? Math.round(stakeN * mult) : 0;

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
      lilypads: race.lilypads || {},
      sink: race.sink_ord != null ? { ord: race.sink_ord, at: Number(race.sink_at) } : null,
      ducks: lineup,
      picked_ord: picked.ord,
      odds_num: picked.odds_num,
      odds_den: picked.odds_den,
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
    for (const k of ['water_colour', 'grass_colour', 'mud_colour']) {
      if (k in p && (typeof p[k] !== 'string' || !HEX_RE.test(p[k]))) {
        return reply.code(400).send({ error: `${k} must be a hex colour` });
      }
    }
    if ('race_duck_count' in p && (!Number.isInteger(p.race_duck_count) || p.race_duck_count < 2 || p.race_duck_count > 10)) {
      return reply.code(400).send({ error: 'race_duck_count must be 2-10' });
    }
    const updates = [];
    const values = [];
    for (const k of ['water_colour', 'grass_colour', 'mud_colour', 'race_duck_count', 'homepage_visible', 'homepage_title', 'homepage_subtitle', 'homepage_days']) {
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
    for (const k of ['odds_num', 'odds_den']) {
      if (k in p && (!Number.isInteger(p[k]) || p[k] < 1 || p[k] > 999)) {
        return reply.code(400).send({ error: `${k} must be a whole number 1-999` });
      }
    }
    const updates = [];
    const values = [];
    for (const k of ['name', 'duck_colour', 'bill_colour', 'odds_num', 'odds_den', 'active']) {
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
    const ord = Number(req.params.ord);
    if (!Number.isInteger(ord) || ord < 1 || ord > 12) return reply.code(400).send({ error: 'ord must be 1-12' });
    const p = req.body ?? {};
    if ('placement' in p && p.placement !== 'top' && p.placement !== 'bottom') {
      return reply.code(400).send({ error: 'placement must be top or bottom' });
    }
    if ('colour' in p && (typeof p.colour !== 'string' || !HEX_RE.test(p.colour))) {
      return reply.code(400).send({ error: 'colour must be a hex colour' });
    }
    const updates = [];
    const values = [];
    for (const k of ['text', 'active', 'placement', 'colour']) {
      if (k in p) { values.push(p[k]); updates.push(`${k} = $${values.length}`); }
    }
    if (updates.length) {
      updates.push('updated_at = NOW()');
      values.push(ord);
      await query(`UPDATE ducky_banners SET ${updates.join(', ')} WHERE ord = $${values.length}`, values);
    }
    return await getDuckyConfig();
  });

  fastify.patch('/api/admin/games/ducky/phrases/:ord', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return await updateRowTable('ducky_phrases', 12, Number(req.params.ord), req.body ?? {}, reply);
  });

  fastify.patch('/api/admin/games/ducky/commentary/:ord', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return await updateRowTable('ducky_commentary', 16, Number(req.params.ord), req.body ?? {}, reply);
  });
}
