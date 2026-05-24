import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { sendPush } from '../notifications/push.js';

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

  fastify.delete('/api/account/rewards/:id', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    await query(`DELETE FROM game_rewards WHERE id = $1 AND account_id = $2`, [req.params.id, meId]);
    return { ok: true };
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
      const claimTitle = isProduct ? 'Reward to deliver' : 'Forfeit to perform';
      const claimBody = isProduct
        ? `${meName} claimed: ${itemLabel}`
        : `${meName} redeemed forfeit: ${itemLabel}`;
      await query(
        `INSERT INTO notifications (account_id, type, title, body, link_url)
         VALUES ($1, 'reward_claim', $2, $3, '/account')`,
        [giverId, claimTitle, claimBody],
      );
      sendPush(giverId, { title: claimTitle, body: claimBody, url: '/account' });
    }
    return { ok: true };
  });
}
