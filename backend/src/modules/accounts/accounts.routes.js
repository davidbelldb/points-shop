import { getAccount, getLedger, getLedgerAdjustments, updateAccountSelf } from './accounts.repo.js';

export default async function accountsRoutes(fastify) {
  fastify.get('/api/account', async () => getAccount());

  fastify.patch('/api/account', async (req, reply) => {
    const b = req.body ?? {};
    const patch = {};
    for (const k of ['name', 'email', 'photo_url']) {
      if (k in b) patch[k] = b[k];
    }
    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ error: 'No editable fields provided' });
    }
    await updateAccountSelf(patch);
    return getAccount();
  });

  fastify.get('/api/account/ledger', async (req) => {
    const limit = Math.min(Number(req.query?.limit ?? 20), 100);
    return getLedger(limit);
  });

  fastify.get('/api/account/ledger/adjustments', async (req) => {
    const limit = Math.min(Number(req.query?.limit ?? 20), 100);
    return getLedgerAdjustments(limit);
  });
}
