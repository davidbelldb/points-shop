import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

const CURVES = ['slow-fast', 'fast-slow', 'steady-slow', 'steady-fast', 'surge'];

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

export default async function duckyRoutes(fastify) {
  // Public config.
  fastify.get('/api/games/ducky/config', async () => {
    const { rows } = await query(`SELECT * FROM ducky_config WHERE id = 1`);
    return rows[0] || null;
  });

  // Create a fresh lineup: pick N active ducks, randomly assign odds, secretly pick a
  // uniform-random winner + the per-duck animation timings. Nothing about the winner is
  // returned, so the client genuinely can't know it before the race runs.
  fastify.post('/api/games/ducky/lineup', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { rows: cfgRows } = await query(`SELECT * FROM ducky_config WHERE id = 1`);
    const cfg = cfgRows[0] || { race_duck_count: 4 };
    const { rows: allDucks } = await query(`SELECT * FROM ducky_ducks WHERE active = TRUE ORDER BY ord`);
    if (allDucks.length < 2) return reply.code(400).send({ error: 'Not enough ducks configured' });

    const n = Math.max(2, Math.min(cfg.race_duck_count || 4, 4, allDucks.length));
    const racers = shuffle(allDucks).slice(0, n);
    // Odds pool: every duck's odds value, shuffled, assigned to racers regardless of speed.
    const oddsPool = shuffle(allDucks.map((d) => Number(d.odds)));
    const lineup = racers.map((d, i) => ({
      ord: d.ord,
      name: d.name,
      duck_colour: d.duck_colour,
      bill_colour: d.bill_colour,
      odds: oddsPool[i % oddsPool.length],
    }));

    const winner = lineup[Math.floor(Math.random() * lineup.length)];
    const winMs = 6300 + Math.floor(Math.random() * 900);
    const finishMs = {};
    const curves = {};
    for (const d of lineup) {
      curves[d.ord] = CURVES[Math.floor(Math.random() * CURVES.length)];
      finishMs[d.ord] = d.ord === winner.ord
        ? winMs
        : winMs + 300 + Math.floor(Math.random() * 2600);
    }

    const { rows } = await query(
      `INSERT INTO ducky_races (account_id, lineup, winner_ord, finish_ms, curves)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [meId, JSON.stringify(lineup), winner.ord, JSON.stringify(finishMs), JSON.stringify(curves)],
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

    const lineup = race.lineup; // jsonb -> parsed
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
      curves: race.curves,
      ducks: lineup,
      picked_ord: picked.ord,
      odds: Number(picked.odds),
      stake: stakeN,
      won,
      payout,
      balance: await getBalance(meId),
    };
  });
}
