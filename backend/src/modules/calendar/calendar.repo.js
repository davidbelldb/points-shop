import { query } from '../../db.js';

const COLUMNS = `
  id, created_by, title, description, location,
  starts_at, ends_at, all_day, show_and_tell, gifts,
  snack_list, created_at, updated_at
`;

/* Events overlapping the [from, to) window, sorted by start time.
   Overlap = (event.starts_at < to) AND (event_end >= from), where event_end
   falls back to starts_at when ends_at is null. */
export async function listEvents(fromIso, toIso) {
  const { rows } = await query(
    `SELECT ${COLUMNS}
       FROM calendar_events
      WHERE starts_at < $2
        AND COALESCE(ends_at, starts_at) >= $1
      ORDER BY starts_at ASC`,
    [fromIso, toIso],
  );
  return rows;
}

/* Upcoming events — those still in progress or in the future — for the
   home-page preview strip. Excludes finished events. */
export async function listUpcoming(limit = 3) {
  const { rows } = await query(
    `SELECT ${COLUMNS}
       FROM calendar_events
      WHERE COALESCE(ends_at, starts_at) >= NOW()
      ORDER BY starts_at ASC
      LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function getEvent(id) {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM calendar_events WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createEvent(accountId, body) {
  const clean = sanitize(body, false);
  const { rows } = await query(
    `INSERT INTO calendar_events
       (created_by, title, description, location,
        starts_at, ends_at, all_day, show_and_tell, gifts, snack_list)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING ${COLUMNS}`,
    [
      accountId,
      clean.title,
      clean.description,
      clean.location,
      clean.starts_at,
      clean.ends_at,
      clean.all_day,
      clean.show_and_tell,
      clean.gifts,
      JSON.stringify(clean.snack_list),
    ],
  );
  return rows[0];
}

export async function updateEvent(id, body) {
  const patch = sanitize(body, true);
  const fields = [];
  const values = [];
  let i = 1;
  for (const key of [
    'title', 'description', 'location',
    'starts_at', 'ends_at', 'all_day',
    'show_and_tell', 'gifts',
  ]) {
    if (key in patch) {
      fields.push(`${key} = $${i++}`);
      values.push(patch[key]);
    }
  }
  if ('snack_list' in patch) {
    fields.push(`snack_list = $${i++}`);
    values.push(JSON.stringify(patch.snack_list));
  }
  if (fields.length === 0) return getEvent(id);
  fields.push(`updated_at = NOW()`);
  values.push(id);
  const { rows } = await query(
    `UPDATE calendar_events SET ${fields.join(', ')}
      WHERE id = $${i}
     RETURNING ${COLUMNS}`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteEvent(id) {
  await query(`DELETE FROM calendar_events WHERE id = $1`, [id]);
}

/* Field normalisation. `partial=true` skips any field absent from the body
   (used by PATCH); `partial=false` validates that the required fields are
   present (used by POST). */
function sanitize(data, partial) {
  const out = {};

  if (!partial || data.title !== undefined) {
    const t = String(data.title ?? '').trim();
    if (!t) throw httpError(400, 'title required');
    out.title = t;
  }
  if (!partial || data.description !== undefined) {
    out.description = data.description ? String(data.description).trim() : null;
  }
  if (!partial || data.location !== undefined) {
    out.location = data.location ? String(data.location).trim() : null;
  }
  if (!partial || data.starts_at !== undefined) {
    if (!data.starts_at) throw httpError(400, 'starts_at required');
    out.starts_at = new Date(data.starts_at).toISOString();
  }
  if (!partial || data.ends_at !== undefined) {
    out.ends_at = data.ends_at ? new Date(data.ends_at).toISOString() : null;
  }
  if (!partial || data.all_day !== undefined) {
    out.all_day = !!data.all_day;
  }
  if (!partial || data.show_and_tell !== undefined) {
    out.show_and_tell = !!data.show_and_tell;
  }
  if (!partial || data.gifts !== undefined) {
    out.gifts = !!data.gifts;
  }
  if (!partial || data.snack_list !== undefined) {
    out.snack_list = Array.isArray(data.snack_list)
      ? data.snack_list.map((s) => String(s ?? '').trim()).filter(Boolean)
      : [];
  }
  return out;
}

function httpError(code, msg) {
  const err = new Error(msg);
  err.statusCode = code;
  return err;
}
