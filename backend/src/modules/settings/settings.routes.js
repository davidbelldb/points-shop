import { getAllSettings, updateSettings } from './settings.repo.js';

export default async function settingsRoutes(fastify) {
  fastify.get('/api/settings', async () => getAllSettings());
  fastify.patch('/api/admin/settings', async (req) => updateSettings(req.body ?? {}));
}
