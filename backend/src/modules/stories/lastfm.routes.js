/* Last.fm proxy for the "Now Playing" story sticker.
   Keeps the API key server-side. Returns the currently scrobbling track
   (or { playing: false } if nothing is active). */

import { config } from '../../config.js';

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';

export default async function lastfmRoutes(fastify) {
  fastify.get('/api/lastfm/now-playing', async (req, reply) => {
    const username = String(req.query?.username ?? '').trim();
    if (!username) return reply.code(400).send({ error: 'username required' });
    if (!config.lastfm.apiKey) return reply.code(503).send({ error: 'Last.fm not configured on this server' });

    try {
      const url = `${LASTFM_BASE}?method=user.getrecenttracks&user=${encodeURIComponent(username)}&api_key=${config.lastfm.apiKey}&format=json&limit=1`;
      const res = await fetch(url);
      const data = await res.json();

      // Last.fm returns error code 6 for unknown users.
      if (data.error) {
        const status = data.error === 6 ? 404 : 502;
        return reply.code(status).send({ error: data.message ?? 'Last.fm error' });
      }

      const tracks = data?.recenttracks?.track;
      // API returns an array when there are tracks, an object when there's one.
      const track = Array.isArray(tracks) ? tracks[0] : tracks;

      if (!track || track['@attr']?.nowplaying !== 'true') {
        return { playing: false };
      }

      return {
        playing: true,
        title: track.name ?? '',
        artist: track.artist?.['#text'] ?? '',
      };
    } catch (e) {
      fastify.log.error({ err: e }, 'lastfm now-playing error');
      return reply.code(502).send({ error: 'Last.fm unreachable' });
    }
  });
}
