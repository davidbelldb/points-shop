import { query } from '../../db.js';

export async function listMoments(accountId) {
  const { rows } = await query(
    `SELECT
       m.id, m.account_id, m.type, m.location, m.body, m.tags,
       m.created_at, m.updated_at,
       a.name AS account_name,
       COALESCE(
         json_agg(
           json_build_object(
             'id',         mm.id,
             'type',       mm.type,
             'url',        mm.url,
             'created_at', mm.created_at
           ) ORDER BY mm.created_at
         ) FILTER (WHERE mm.id IS NOT NULL),
         '[]'
       ) AS media
     FROM moments m
     JOIN accounts a ON a.id = m.account_id
     LEFT JOIN moment_media mm ON mm.moment_id = m.id
     WHERE m.type = 'shared' OR m.account_id = $1
     GROUP BY m.id, a.name
     ORDER BY m.created_at DESC`,
    [accountId]
  );
  return rows;
}

export async function getMoment(id, accountId) {
  const { rows } = await query(
    `SELECT
       m.id, m.account_id, m.type, m.location, m.body, m.tags,
       m.created_at, m.updated_at,
       a.name AS account_name,
       COALESCE(
         json_agg(
           json_build_object(
             'id',         mm.id,
             'type',       mm.type,
             'url',        mm.url,
             'created_at', mm.created_at
           ) ORDER BY mm.created_at
         ) FILTER (WHERE mm.id IS NOT NULL),
         '[]'
       ) AS media
     FROM moments m
     JOIN accounts a ON a.id = m.account_id
     LEFT JOIN moment_media mm ON mm.moment_id = m.id
     WHERE m.id = $1
       AND (m.type = 'shared' OR m.account_id = $2)
     GROUP BY m.id, a.name`,
    [id, accountId]
  );
  return rows[0] ?? null;
}

export async function createMoment(accountId, type) {
  const { rows } = await query(
    `WITH ins AS (
       INSERT INTO moments (account_id, type)
       VALUES ($1, $2)
       RETURNING *
     )
     SELECT ins.*, a.name AS account_name
     FROM ins
     JOIN accounts a ON a.id = ins.account_id`,
    [accountId, type]
  );
  const m = rows[0];
  m.media = [];
  return m;
}

export async function updateMoment(id, accountId, { location, body, tags }) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (location !== undefined) { fields.push(`location = $${idx++}`); values.push(location); }
  if (body !== undefined)     { fields.push(`body = $${idx++}`);     values.push(body); }
  if (tags !== undefined)     { fields.push(`tags = $${idx++}`);     values.push(tags); }

  if (fields.length === 0) return null;

  fields.push('updated_at = NOW()');
  values.push(id, accountId);

  const { rows } = await query(
    `UPDATE moments SET ${fields.join(', ')}
     WHERE id = $${idx++} AND account_id = $${idx++}
     RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

export async function promoteMoment(id, accountId) {
  const { rows } = await query(
    `UPDATE moments SET type = 'shared', updated_at = NOW()
     WHERE id = $1 AND account_id = $2 AND type = 'personal'
     RETURNING *`,
    [id, accountId]
  );
  return rows[0] ?? null;
}

export async function deleteMoment(id, accountId) {
  const { rowCount } = await query(
    `DELETE FROM moments WHERE id = $1 AND account_id = $2`,
    [id, accountId]
  );
  return rowCount > 0;
}

export async function addMedia(momentId, accountId, { type, url }) {
  const { rows: own } = await query(
    `SELECT id FROM moments WHERE id = $1 AND account_id = $2`,
    [momentId, accountId]
  );
  if (!own.length) return null;

  const { rows } = await query(
    `INSERT INTO moment_media (moment_id, type, url)
     VALUES ($1, $2, $3)
     RETURNING id, moment_id, type, url, created_at`,
    [momentId, type, url]
  );
  return rows[0];
}

export async function removeMedia(momentId, mediaId, accountId) {
  const { rowCount } = await query(
    `DELETE FROM moment_media mm
     USING moments m
     WHERE mm.id = $1
       AND mm.moment_id = $2
       AND m.id = mm.moment_id
       AND m.account_id = $3`,
    [mediaId, momentId, accountId]
  );
  return rowCount > 0;
}
