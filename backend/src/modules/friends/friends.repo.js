import { query } from '../../db.js';

/*
 * Friendships decide who may message whom.
 *
 * A pair is stored once, lower uuid first, so "David asked George" and "George
 * asked David" can't both exist. Every read below therefore has to look at both
 * columns — hence the CASE in the joins.
 */

/* A friendship involving a kids account needs an admin to agree as well as the
   person being asked. Flip this to false to make a child's account behave like
   anyone else's. */
const KIDS_FRIENDSHIPS_NEED_ADMIN = true;

/** The other side of the pair, with their account details and the row's state. */
const SELECT_OTHER = `
  SELECT f.id                AS friendship_id,
         f.status,
         f.requested_by,
         f.created_at        AS requested_at,
         o.id, o.username, o.name, o.photo_url, o.role, o.audience
    FROM friendships f
    JOIN accounts o
      ON o.id = CASE WHEN f.account_a = $1 THEN f.account_b ELSE f.account_a END
   WHERE $1 IN (f.account_a, f.account_b)
`;

/** Everyone the caller may actually message. */
export async function listFriends(accountId) {
  const { rows } = await query(
    `${SELECT_OTHER} AND f.status = 'accepted' ORDER BY o.name, o.username`,
    [accountId],
  );
  return rows;
}

/** Requests waiting on the caller to answer. */
export async function listIncoming(accountId) {
  const { rows } = await query(
    `${SELECT_OTHER} AND f.status = 'pending' AND f.requested_by <> $1
      ORDER BY f.created_at DESC`,
    [accountId],
  );
  return rows;
}

/** Requests the caller has sent and not heard back on — including ones the
 *  other person accepted that are still waiting on an admin. */
export async function listOutgoing(accountId) {
  const { rows } = await query(
    `${SELECT_OTHER}
       AND f.status IN ('pending', 'awaiting_approval')
       AND f.requested_by = $1
      ORDER BY f.created_at DESC`,
    [accountId],
  );
  return rows;
}

/** Accounts the caller has no friendship row with at all — who's left to ask. */
export async function listSuggestions(accountId) {
  const { rows } = await query(
    `SELECT a.id, a.username, a.name, a.photo_url, a.role
       FROM accounts a
      WHERE a.id <> $1
        AND NOT EXISTS (
          SELECT 1 FROM friendships f
           WHERE f.account_a = LEAST($1::uuid, a.id)
             AND f.account_b = GREATEST($1::uuid, a.id)
        )
      ORDER BY a.name, a.username`,
    [accountId],
  );
  return rows;
}

/** Everything still waiting on an admin, across the whole household. */
export async function listAwaitingApproval() {
  const { rows } = await query(
    `SELECT f.id AS friendship_id, f.status, f.created_at AS requested_at,
            a.id AS a_id, a.name AS a_name, a.username AS a_username, a.audience AS a_audience,
            b.id AS b_id, b.name AS b_name, b.username AS b_username, b.audience AS b_audience,
            f.requested_by
       FROM friendships f
       JOIN accounts a ON a.id = f.account_a
       JOIN accounts b ON b.id = f.account_b
      WHERE f.status = 'awaiting_approval'
      ORDER BY f.created_at`,
  );
  return rows;
}

/** Can these two message each other right now? */
export async function areFriends(x, y) {
  if (!x || !y || x === y) return false;
  // Postgres orders the pair, not JavaScript — string comparison of uuids only
  // matches byte order while every value happens to be lower-case.
  const { rows } = await query(
    `SELECT 1 FROM friendships
      WHERE account_a = LEAST($1::uuid, $2::uuid)
        AND account_b = GREATEST($1::uuid, $2::uuid)
        AND status = 'accepted'`,
    [x, y],
  );
  return rows.length > 0;
}

/**
 * Ask someone. A previously declined pair may ask again — the row is reused and
 * reset, so declining doesn't block someone for good.
 */
export async function requestFriend(accountId, targetId) {
  if (!targetId || targetId === accountId) {
    const err = new Error('No such person'); err.statusCode = 400; throw err;
  }
  const { rows: exists } = await query(`SELECT 1 FROM accounts WHERE id = $1`, [targetId]);
  if (!exists.length) {
    const err = new Error('No such person'); err.statusCode = 404; throw err;
  }

  const { rows } = await query(
    `INSERT INTO friendships (account_a, account_b, requested_by, status)
     SELECT LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), $3::uuid, 'pending'
     ON CONFLICT (account_a, account_b) DO UPDATE
            SET status       = CASE WHEN friendships.status = 'declined'
                                    THEN 'pending' ELSE friendships.status END,
                requested_by = CASE WHEN friendships.status = 'declined'
                                    THEN EXCLUDED.requested_by ELSE friendships.requested_by END,
                created_at   = CASE WHEN friendships.status = 'declined'
                                    THEN NOW() ELSE friendships.created_at END,
                responded_at = CASE WHEN friendships.status = 'declined'
                                    THEN NULL ELSE friendships.responded_at END
      RETURNING id, status`,
    [accountId, targetId, accountId],
  );
  return rows[0];
}

/**
 * Answer a request. Only the person who was ASKED may answer — the requester
 * accepting their own request would make the whole thing decorative.
 */
export async function respondToRequest(accountId, friendshipId, accept) {
  const { rows } = await query(
    `SELECT f.*,
            a.audience AS a_audience,
            b.audience AS b_audience
       FROM friendships f
       JOIN accounts a ON a.id = f.account_a
       JOIN accounts b ON b.id = f.account_b
      WHERE f.id = $1`,
    [friendshipId],
  );
  const row = rows[0];
  if (!row || ![row.account_a, row.account_b].includes(accountId)) {
    const err = new Error('No such request'); err.statusCode = 404; throw err;
  }
  if (row.requested_by === accountId) {
    const err = new Error('You sent this one'); err.statusCode = 403; throw err;
  }
  if (row.status !== 'pending') {
    const err = new Error('Already answered'); err.statusCode = 409; throw err;
  }

  const involvesKid = row.a_audience === 'kids' || row.b_audience === 'kids';
  const next = !accept ? 'declined'
    : (KIDS_FRIENDSHIPS_NEED_ADMIN && involvesKid ? 'awaiting_approval' : 'accepted');

  const { rows: updated } = await query(
    `UPDATE friendships SET status = $2, responded_at = NOW()
      WHERE id = $1 RETURNING id, status`,
    [friendshipId, next],
  );
  return updated[0];
}

/** An admin signing off a friendship that involves a child's account. */
export async function approveFriendship(friendshipId, adminId, approve = true) {
  const { rows } = await query(
    `UPDATE friendships
        SET status = $3, approved_by = $2, responded_at = NOW()
      WHERE id = $1 AND status = 'awaiting_approval'
      RETURNING id, status`,
    [friendshipId, adminId, approve ? 'accepted' : 'declined'],
  );
  if (!rows[0]) {
    const err = new Error('Nothing to approve'); err.statusCode = 404; throw err;
  }
  return rows[0];
}

/** Either side may walk away; the row goes, so they can connect again later. */
export async function removeFriendship(accountId, friendshipId) {
  const { rowCount } = await query(
    `DELETE FROM friendships WHERE id = $1 AND $2 IN (account_a, account_b)`,
    [friendshipId, accountId],
  );
  return rowCount > 0;
}
