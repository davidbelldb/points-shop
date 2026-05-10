import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

async function findGiver(reward) {
  if (reward.source_type === 'giftsweeper' && reward.source_id) {
    const r = await query(
      `SELECT initiator_account_id, opponent_account_id FROM giftsweeper_matches WHERE id = $1`,
      [reward.source_id],
    );
    const m = r.rows[0];
    if (!m) return null;
    return m.initiator_account_id === reward.account_id ? m.opponent_account_id : m.initiator_account_id;
  }
  return null;
}

export default async function rewardsRoutes(fastify) {
  fastify.get('/api/account/rewards', async (req) => {
    const meId = getEffectiveAccountId(req);
    const { rows } = await query(
      `SELECT r.*, p.name AS product_name, p.thumbnail_url AS product_thumbnail
         FROM game_rewards r
         LEFT JOIN products p ON p.id = r.product_id
        WHERE r.account_id = $1
        ORDER BY (r.status = 'pending') DESC, r.created_at DESC`,
      [meId],
    );
    return rows;
  });

  fastify.post('/api/account/rewards/:id/claim', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { id } = req.params;
    const r = await query(
      `SELECT r.*, p.name AS product_name FROM game_rewards r
         LEFT JOIN products p ON p.id = r.product_id
        WHERE r.id = $1 AND r.account_id = $2`,
      [id, meId],
    );
    const reward = r.rows[0];
    if (!reward) return reply.code(404).send({ error: 'Reward not found' });
    if (reward.status === 'claimed') return reply.code(400).send({ error: 'Already claimed' });
    await query(`UPDATE game_rewards SET status = 'claimed', claimed_at = NOW() WHERE id = $1`, [id]);

    const giverId = await findGiver(reward);
    if (giverId) {
      const meInfo = await query(`SELECT name FROM accounts WHERE id = $1`, [meId]);
      const meName = meInfo.rows[0]?.name ?? 'They';
      const itemLabel = reward.product_name || reward.text_label || 'a reward';
      const isProduct = !!reward.product_id;
      await query(
        `INSERT INTO notifications (account_id, type, title, body, link_url)
         VALUES ($1, 'reward_claim', $2, $3, '/account')`,
        [
          giverId,
          isProduct ? 'Reward to deliver' : 'Forfeit to perform',
          isProduct ? `${meName} claimed: ${itemLabel}` : `${meName} redeemed forfeit: ${itemLabel}`,
        ],
      );
    }
    return { ok: true };
  });
}
