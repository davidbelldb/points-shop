import { query } from '../../db.js';
import { getAudience } from '../auth/auth.helpers.js';
import {
  ALL_FEATURES, KIDS_DEFAULT, enabledFeaturesFor, clearFeatureCache,
} from '../../features.js';

export default async function featuresRoutes(fastify) {
  /* What the signed-in account may reach. The native app builds its tabs and
     home sections from this rather than hardcoding what a kid should get. */
  fastify.get('/api/features', async (req) => {
    const audience = getAudience(req);
    return { audience, features: await enabledFeaturesFor(audience) };
  });

  /* ---- Admin ---- */

  fastify.get('/api/admin/features', async () => {
    const { rows } = await query(
      `SELECT feature, audience, enabled FROM feature_access ORDER BY feature, audience`,
    );
    // Include features that have no row yet, so the admin UI can list
    // everything the code knows about rather than only what's been saved.
    const known = new Set(rows.map((r) => `${r.audience}:${r.feature}`));
    for (const feature of ALL_FEATURES) {
      for (const audience of ['adult', 'kids']) {
        if (!known.has(`${audience}:${feature}`)) {
          rows.push({ feature, audience, enabled: audience !== 'kids' });
        }
      }
    }
    return {
      features: rows.sort((a, b) => a.feature.localeCompare(b.feature) || a.audience.localeCompare(b.audience)),
      kids_default: KIDS_DEFAULT,
    };
  });

  fastify.patch('/api/admin/features/:feature', async (req, reply) => {
    const { feature } = req.params;
    if (!ALL_FEATURES.includes(feature)) {
      return reply.code(404).send({ error: 'Unknown feature' });
    }
    const audience = req.query?.audience === 'kids' ? 'kids' : 'adult';
    const { enabled } = req.body ?? {};
    if (typeof enabled !== 'boolean') {
      return reply.code(400).send({ error: 'enabled must be a boolean' });
    }

    await query(
      `INSERT INTO feature_access (feature, audience, enabled, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (feature, audience)
       DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
      [feature, audience, enabled],
    );
    clearFeatureCache(); // the gate caches for 30s; a toggle takes effect now
    return { feature, audience, enabled };
  });
}
