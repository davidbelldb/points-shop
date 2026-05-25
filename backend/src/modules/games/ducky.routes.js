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

// Weighted winner draw — each duck's chance is its fractional-odds implied
// probability (den / (num + den)). Favourites win more; longshots still can.
function pickWinner(lineup) {
  const weights = lineup.map((d) => {
    const num = d.odds_num > 0 ? d.odds_num : 1;
    const den = d.odds_den > 0 ? d.odds_den : 1;
    return den / (num + den);
  });
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  let r = Math.random() * total;
  for (let i = 0; i < lineup.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return lineup[i];
  }
  return lineup[lineup.length - 1];
}

async function getDuckyConfig() {
  const { rows: cfgRows } = await query(`SELECT * FROM ducky_config WHERE id = 1`);
  const cfg = cfgRows[0] || null;
  if (!cfg) return null;
  const { rows: ducks } = await query(`SELECT * FROM ducky_ducks ORDER BY ord`);
  const { rows: banners } = await query(`SELECT ord, text, active, placement, colour FROM ducky_banners ORDER BY ord`);
  const { rows: phrases } = await query(`SELECT ord, text, active FROM ducky_phrases ORDER BY ord`);
  const { rows: commentary } = await query(`SELECT ord, text, active FROM ducky_commentary ORDER BY ord`);
  const { rows: intro } = await query(`SELECT ord, text, active FROM ducky_intro ORDER BY ord`);
  cfg.ducks = ducks;
  cfg.banners = banners;
  cfg.phrases = phrases;
  cfg.commentary = commentary;
  cfg.intro = intro;
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

  // Per-duck recent form (W/L from past races) for the home form-guide table.
  fastify.get('/api/games/ducky/form', async () => {
    const { rows } = await query(
      `SELECT winner_ord, lineup FROM ducky_races
        WHERE raced_at IS NOT NULL
        ORDER BY raced_at DESC LIMIT 80`,
    );
    const form = {};
    for (let ord = 1; ord <= 10; ord += 1) form[ord] = { runs: 0, wins: 0, recent: [] };
    for (const r of rows) {
      for (const d of r.lineup || []) {
        const f = form[d.ord];
        if (!f) continue;
        f.runs += 1;
        const won = r.winner_ord === d.ord;
        if (won) f.wins += 1;
        if (f.recent.length < 6) f.recent.push(won ? 'W' : 'L');
      }
    }
    return form;
  });

  // Create a lineup — races a random subset of active ducks (up to race_duck_count),
  // each with its own odds; secret odds-weighted winner + timings.
  fastify.post('/api/games/ducky/lineup', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { rows: cfgRows } = await query(`SELECT * FROM ducky_config WHERE id = 1`);
    const cfg = cfgRows[0] || { race_duck_count: 10 };
    const { rows: allDucks } = await query(`SELECT * FROM ducky_ducks WHERE active = TRUE ORDER BY ord`);
    if (allDucks.length < 2) return reply.code(400).send({ error: 'Not enough ducks configured' });

    const n = Math.max(2, Math.min(cfg.race_duck_count || 10, 10, allDucks.length));
    const racers = shuffle(allDucks).slice(0, n);
    // each duck keeps its own admin-set odds, so its form means something
    const lineup = racers.map((d) => ({
      ord: d.ord,
      name: d.name,
      duck_colour: d.duck_colour,
      bill_colour: d.bill_colour,
      odds_num: d.odds_num,
      odds_den: d.odds_den,
    }));

    // winner is drawn weighted by the odds — favourites win more often
    const winner = pickWinner(lineup);
    const winMs = 25000 + Math.floor(Math.random() * 1500);
    const buoyColour = cfg.buoy_colour || '#e0322e';

    // ~40% of races crown a "chaser" who finishes on the winner's tail — a photo finish.
    const fieldOrds = lineup.filter((d) => d.ord !== winner.ord);
    const chaserOrd = fieldOrds.length && Math.random() < 0.4
      ? fieldOrds[Math.floor(Math.random() * fieldOrds.length)].ord
      : null;

    // buoys — admin-set count spread across the mid-field (0 turns them off).
    const buoyCount = Math.max(0, Math.min(Number(cfg.buoy_count ?? 4) || 0, 12));
    const buoyField = lineup.filter((d) => d.ord !== winner.ord && d.ord !== chaserOrd);
    const buoyByOrd = {};
    for (let i = 0; i < buoyCount && buoyField.length; i++) {
      const d = buoyField[Math.floor(Math.random() * buoyField.length)];
      (buoyByOrd[d.ord] = buoyByOrd[d.ord] || []).push({
        kind: 'buoy',
        at: Math.round((0.18 + Math.random() * 0.62) * 1000) / 1000,
        durationMs: 500 + Math.floor(Math.random() * 700),
        colour: buoyColour,
        fromTop: Math.random() < 0.5,
      });
    }

    const finishMs = {};
    const whirlpools = {}; // per-duck obstacle list (whirlpools + buoys + lily pads), sorted by `at`
    for (const d of lineup) {
      const isWinner = d.ord === winner.ord;
      const isChaser = d.ord === chaserOrd;
      let base;
      if (isWinner) base = winMs;
      else if (isChaser) base = winMs + 200 + Math.floor(Math.random() * 380);
      else base = winMs + 700 + Math.floor(Math.random() * 3200);

      const whirls = makeWhirlpools().map((w) => ({ ...w, kind: 'whirl' }));
      // buoys assigned above; lily pads are per-duck — never the winner or the chaser.
      const buoys = buoyByOrd[d.ord] || [];
      const pads = [];
      if (!isWinner && !isChaser && Math.random() < 0.5) {
        const pc = Math.random() < 0.3 ? 2 : 1;
        for (let i = 0; i < pc; i++) {
          pads.push({
            kind: 'pad',
            at: Math.round((0.2 + Math.random() * 0.56) * 1000) / 1000,
            boost: 0.06,    // progress gained in the leap
            boostMs: 480,   // a short, fast burst, the visible speed-up
          });
        }
      }

      const buoyTotal = buoys.reduce((s, b) => s + b.durationMs, 0);
      let F = base + buoyTotal - pads.length * 900;
      if (!isWinner) F = Math.max(F, winMs + (isChaser ? 150 : 350));
      finishMs[d.ord] = F;
      whirlpools[d.ord] = [...whirls, ...buoys, ...pads].sort((a, b) => a.at - b.at);
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
      `INSERT INTO ducky_races (account_id, lineup, winner_ord, finish_ms, whirlpools, sink_ord, sink_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [meId, JSON.stringify(lineup), winner.ord, JSON.stringify(finishMs), JSON.stringify(whirlpools), sinkOrd, sinkAt],
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
    for (const k of ['water_colour', 'grass_colour', 'mud_colour', 'buoy_colour']) {
      if (k in p && (typeof p[k] !== 'string' || !HEX_RE.test(p[k]))) {
        return reply.code(400).send({ error: `${k} must be a hex colour` });
      }
    }
    if ('race_duck_count' in p && (!Number.isInteger(p.race_duck_count) || p.race_duck_count < 2 || p.race_duck_count > 10)) {
      return reply.code(400).send({ error: 'race_duck_count must be 2-10' });
    }
    if ('buoy_count' in p && (!Number.isInteger(p.buoy_count) || p.buoy_count < 0 || p.buoy_count > 12)) {
      return reply.code(400).send({ error: 'buoy_count must be 0-12' });
    }
    const updates = [];
    const values = [];
    for (const k of ['water_colour', 'grass_colour', 'mud_colour', 'buoy_colour', 'buoy_count', 'race_duck_count', 'homepage_visible', 'homepage_title', 'homepage_subtitle', 'homepage_days']) {
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

  fastify.patch('/api/admin/games/ducky/intro/:ord', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return await updateRowTable('ducky_intro', 8, Number(req.params.ord), req.body ?? {}, reply);
  });
}
