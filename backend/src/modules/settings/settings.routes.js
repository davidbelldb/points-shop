import { getAudience } from '../auth/auth.helpers.js';
import { getAllSettings, updateSettings } from './settings.repo.js';

export default async function settingsRoutes(fastify) {
  fastify.get('/api/settings', async (req) => getAllSettings(getAudience(req)));
  // Admin edits a named audience; without one it's the adult set, as before.
  fastify.patch('/api/admin/settings', async (req) =>
    updateSettings(req.body ?? {}, req.query?.audience === 'kids' ? 'kids' : 'adult'),
  );
}
