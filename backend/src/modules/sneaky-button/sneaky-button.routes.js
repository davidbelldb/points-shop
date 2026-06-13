import { query } from '../../db.js';

const ALLOWED = ['homepage_visible', 'homepage_days', 'animal_type', 'button_label'];

async function getConfig() {
  const { rows } = await query(`SELECT * FROM sneaky_button_config WHERE id = 1`);
  return rows[0] || null;
}

function validatePatch(patch) {
  if ('homepage_visible' in patch && typeof patch.homepage_visible !== 'boolean') {
    return 'homepage_visible must be a boolean';
  }
  if ('homepage_days' in patch) {
    if (!Array.isArray(patch.homepage_days) || patch.homepage_days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return 'homepage_days must be an array of integers 0-6';
    }
  }
  if ('animal_type' in patch && !['cat', 'duck', 'random'].includes(patch.animal_type)) {
    return 'animal_type must be cat, duck, or random';
  }
  if ('button_label' in patch && (typeof patch.button_label !== 'string' || patch.button_label.length > 60)) {
    return 'button_label must be a string up to 60 characters';
  }
  return null;
}

const ANIMAL_KINDS = ['cat', 'duck'];

// Random cute gif of a cat (via TheCatAPI) or a duck (via random-d.uk).
// Both are restricted to gif results only. TheCatAPI works unauthenticated at
// modest rate limits; an optional CAT_API_KEY env var (sent as x-api-key)
// raises that limit if Katie wants more headroom later. random-d.uk needs no
// key at all.
async function fetchAnimalImage(kind) {
  if (kind === 'duck') {
    try {
      const res = await fetch('https://random-d.uk/api/v2/random?type=gif');
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.url) return null;
      return {
        url: data.url,
        kind,
        is_gif: true,
      };
    } catch {
      return null;
    }
  }

  const key = (process.env.CAT_API_KEY || '').trim();
  try {
    const res = await fetch(
      'https://api.thecatapi.com/v1/images/search?mime_types=gif',
      key ? { headers: { 'x-api-key': key } } : undefined,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const item = Array.isArray(data) ? data[0] : null;
    if (!item?.url) return null;
    return {
      url: item.url,
      kind,
      is_gif: true,
    };
  } catch {
    return null;
  }
}

export default async function sneakyButtonRoutes(fastify) {
  // Public — homepage gating info.
  fastify.get('/api/sneaky-button/config', async () => {
    const cfg = await getConfig();
    if (!cfg) {
      return { homepage_visible: false, homepage_days: [0, 1, 2, 3, 4, 5, 6], animal_type: 'cat', button_label: '🐾 Sneaky Button' };
    }
    return {
      homepage_visible: cfg.homepage_visible,
      homepage_days: cfg.homepage_days,
      animal_type: cfg.animal_type,
      button_label: cfg.button_label,
    };
  });

  // Public — fetch one random cute image/gif according to the configured animal type.
  fastify.get('/api/sneaky-button/random', async (req, reply) => {
    const cfg = await getConfig();
    const animalType = cfg?.animal_type || 'cat';
    const kind = animalType === 'random'
      ? ANIMAL_KINDS[Math.floor(Math.random() * ANIMAL_KINDS.length)]
      : animalType;
    const result = await fetchAnimalImage(kind);
    if (!result) return reply.code(502).send({ error: `Couldn't fetch a ${kind} picture right now — try again in a moment.` });
    return result;
  });

  // ── Admin ──────────────────────────────────────────────────────────────────

  fastify.get('/api/admin/sneaky-button', async (req, reply) => {
    if (req.user?.actualRole !== 'admin') return reply.code(403).send({ error: 'forbidden' });
    return await getConfig();
  });

  fastify.patch('/api/admin/sneaky-button', async (req, reply) => {
    if (req.user?.actualRole !== 'admin') return reply.code(403).send({ error: 'forbidden' });
    const patch = req.body ?? {};
    const err = validatePatch(patch);
    if (err) return reply.code(400).send({ error: err });

    const updates = [];
    const values = [];
    for (const key of ALLOWED) {
      if (key in patch) { values.push(patch[key]); updates.push(`${key} = $${values.length}`); }
    }
    if (!updates.length) return reply.code(400).send({ error: 'nothing to update' });
    updates.push('updated_at = NOW()');
    const { rows } = await query(
      `UPDATE sneaky_button_config SET ${updates.join(', ')} WHERE id = 1 RETURNING *`,
      values,
    );
    return rows[0];
  });
}
