/*
 * Giphy, proxied.
 *
 * The web app calls Giphy straight from the browser with the key baked into
 * the bundle. An app binary is worse than a bundle for that — it's shipped once
 * and can't be rotated — so the native client asks us instead and the key never
 * leaves the server.
 */
const GIPHY = 'https://api.giphy.com/v1/gifs';

function apiKey() {
  return process.env.GIPHY_API_KEY || process.env.VITE_GIPHY_API_KEY || '';
}

/** Only what the picker draws: a still for the grid, and the gif to send. */
function slim(gif) {
  return {
    id: gif.id,
    title: gif.title ?? '',
    preview: gif.images?.fixed_width_downsampled?.url ?? gif.images?.fixed_width_small?.url ?? null,
    url: gif.images?.fixed_width?.url ?? gif.images?.original?.url ?? null,
    width: Number(gif.images?.fixed_width?.width) || 200,
    height: Number(gif.images?.fixed_width?.height) || 200,
  };
}

export default async function giphyRoutes(fastify) {
  fastify.get('/api/giphy', async (req, reply) => {
    const key = apiKey();
    if (!key) return reply.code(503).send({ error: 'GIFs are not set up on this server' });

    const q = (req.query?.q ?? '').trim();
    const limit = Math.min(Number(req.query?.limit) || 24, 50);
    const url = q
      ? `${GIPHY}/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg13&bundle=messaging_non_clips`
      : `${GIPHY}/trending?api_key=${key}&limit=${limit}&rating=pg13&bundle=messaging_non_clips`;

    try {
      const res = await fetch(url);
      if (!res.ok) return reply.code(502).send({ error: 'Giphy is not answering' });
      const body = await res.json();
      return { gifs: (body.data ?? []).map(slim).filter((g) => g.url) };
    } catch {
      return reply.code(502).send({ error: 'Giphy is not answering' });
    }
  });
}
