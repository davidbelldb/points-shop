import { getAccount, getLedger, getLedgerAdjustments, updateAccountSelf } from './accounts.repo.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { query } from '../../db.js';

export default async function accountsRoutes(fastify) {
  fastify.get('/api/account', async (req) => getAccount(getEffectiveAccountId(req)));

  fastify.patch('/api/account', async (req, reply) => {
    const b = req.body ?? {};
    const patch = {};
    for (const k of ['name', 'email', 'photo_url']) if (k in b) patch[k] = b[k];
    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ error: 'No editable fields provided' });
    }
    const accountId = getEffectiveAccountId(req);
    await updateAccountSelf(accountId, patch);
    return getAccount(accountId);
  });

  fastify.get('/api/account/ledger', async (req) => {
    const limit = Math.min(Number(req.query?.limit ?? 20), 100);
    return getLedger(getEffectiveAccountId(req), limit);
  });

  fastify.get('/api/account/ledger/adjustments', async (req) => {
    const limit = Math.min(Number(req.query?.limit ?? 20), 100);
    return getLedgerAdjustments(getEffectiveAccountId(req), limit);
  });

  // Hide a single ledger entry from the user's awarded-points history. Does not refund/charge.
  fastify.delete('/api/account/ledger/:id', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const id = req.params.id;
    const r = await query(
      `DELETE FROM points_ledger WHERE id = $1 AND account_id = $2 RETURNING id`,
      [id, meId]
    );
    if (r.rowCount === 0) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });
}
