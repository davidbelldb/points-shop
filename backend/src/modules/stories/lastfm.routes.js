/* Last.fm proxy for the "Now Playing" story sticker.
   Keeps the API key server-side.
   GET /api/lastfm/search?q=QUERY — returns up to 6 matching tracks. */

import { config } from '../../config.js';

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';

export default async function lastfmRoutes(fastify) {
  fastify.get('/api/lastfm/search', async (req, reply) => {
    const q = String(req.query?.q ?? '').trim();
    if (!q) return reply.code(400).send({ error: 'q required' });
    if (!config.lastfm.apiKey) return reply.code(503).send({ error: 'Last.fm not configured on this server' });

    try {
      const url = `${LASTFM_BASE}?method=track.search&track=${encodeURIComponent(q)}&api_key=${config.lastfm.apiKey}&format=json&limit=6`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        return reply.code(502).send({ error: data.message ?? 'Last.fm error' });
      }

      const raw = data?.results?.trackmatches?.track ?? [];
      const tracks = Array.isArray(raw) ? raw : [raw];
      return tracks.map((t) => ({ title: t.name, artist: t.artist }));
    } catch (e) {
      fastify.log.error({ err: e }, 'lastfm search error');
      return reply.code(502).send({ error: 'Last.fm unreachable' });
    }
  });
}
