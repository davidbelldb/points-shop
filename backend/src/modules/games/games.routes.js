import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

/**
 * Lightweight endpoints shared between mini-games (Tic-tac-face,
 * Wheel of Misfortune, Giftsweeper). Right now we just expose the two
 * players' faces so the client can render them as game pieces.
 */
export default async function gamesRoutes(fastify) {
  fastify.get('/api/games/players', async (req) => {
    const me = getEffectiveAccountId(req);
    const { rows } = await query(
      `SELECT id, username, name, photo_url, role
         FROM accounts
        ORDER BY
          CASE WHEN id = $1 THEN 0 ELSE 1 END,
          CASE role WHEN 'admin' THEN 1 ELSE 0 END,
          created_at`,
      [me],
    );
    const meRow    = rows.find((r) => r.id === me) ?? rows[0] ?? null;
    const otherRow = rows.find((r) => r.id !== meRow?.id) ?? null;
    return { me: meRow, other: otherRow };
  });
}
