import { getAccount, getLedger, getLedgerAdjustments, updateAccountSelf } from './accounts.repo.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { query } from '../../db.js';

export default async function accountsRoutes(fastify) {
  fastify.get('/api/account', async (req) => getAccount(getEffectiveAccountId(req)));

  fastify.patch('/api/account', async (req, reply) => {
    const b = req.body ?? {};
    const patch = {};
    for (const k of ['name', 'email', 'photo_url', 'theme']) if (k in b) patch[k] = b[k];
    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ error: 'No editable fields provided' });
    }
    const accountId = getEffectiveAccountId(req);
    await updateAccountSelf(accountId, patch);
    return getAccount(accountId);
  });

  // Where you're sending from. It's on the account rather than the message:
  // you set it once and it holds until you move. Without it, a message's crow
  // has no distance to fly and falls back to the default journey.
  fastify.get('/api/account/location', async (req) => {
    const { rows } = await query(
      `SELECT location_lat AS lat, location_lng AS lng,
              location_label AS label, location_set_at AS set_at
         FROM accounts WHERE id = $1`,
      [getEffectiveAccountId(req)],
    );
    return rows[0] ?? { lat: null, lng: null, label: null, set_at: null };
  });

  // body: { lat, lng, label } — or { lat: null } to forget it again.
  fastify.put('/api/account/location', async (req, reply) => {
    const { lat, lng, label } = req.body ?? {};

    if (lat == null && lng == null) {
      const { rows } = await query(
        `UPDATE accounts
            SET location_lat = NULL, location_lng = NULL,
                location_label = NULL, location_set_at = NULL
          WHERE id = $1
      RETURNING location_lat AS lat, location_lng AS lng,
                location_label AS label, location_set_at AS set_at`,
        [getEffectiveAccountId(req)],
      );
      return rows[0];
    }

    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90
     || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
      return reply.code(400).send({ error: 'lat and lng required' });
    }

    const { rows } = await query(
      `UPDATE accounts
          SET location_lat = $2, location_lng = $3,
              location_label = $4, location_set_at = NOW()
        WHERE id = $1
    RETURNING location_lat AS lat, location_lng AS lng,
              location_label AS label, location_set_at AS set_at`,
      [
        getEffectiveAccountId(req), latitude, longitude,
        typeof label === 'string' && label.trim() ? label.trim().slice(0, 120) : null,
      ],
    );
    return rows[0];
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
