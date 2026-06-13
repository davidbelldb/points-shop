import { query } from '../../db.js';

/** Map a DB row to the shape the frontend timeline components expect. */
function toMilestone(row) {
  return {
    id: row.id,
    date: row.date,
    displayDate: row.display_date,
    title: row.title,
    description: row.description,
    icon: row.icon,
    media: row.media ?? null,
    location:
      row.location_lat != null && row.location_lng != null
        ? { lat: row.location_lat, lng: row.location_lng, label: row.location_label ?? null }
        : null,
    sortOrder: row.sort_order,
    visible: row.visible,
  };
}

/**
 * @param {boolean} includeHidden - admin views pass `true` to see every
 *   milestone (so they can toggle visibility); the public /timeline route
 *   passes `false` (default) so hidden milestones never reach the page.
 */
export async function listMilestones(includeHidden = false) {
  const { rows } = await query(
    includeHidden
      ? `SELECT * FROM timeline_milestones ORDER BY sort_order ASC, date ASC, created_at ASC`
      : `SELECT * FROM timeline_milestones WHERE visible = true ORDER BY sort_order ASC, date ASC, created_at ASC`
  );
  return rows.map(toMilestone);
}

export async function getMilestone(id) {
  const { rows } = await query(`SELECT * FROM timeline_milestones WHERE id = $1`, [id]);
  return rows[0] ? toMilestone(rows[0]) : null;
}

export async function createMilestone({
  date,
  displayDate = '',
  title = '',
  description = '',
  icon = 'Heart',
  media = null,
  location = null,
  visible = true,
}) {
  const { rows: maxRows } = await query(
    `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM timeline_milestones`
  );
  const sortOrder = maxRows[0].next;

  const { rows } = await query(
    `INSERT INTO timeline_milestones
       (sort_order, date, display_date, title, description, icon, media, location_lat, location_lng, location_label, visible)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      sortOrder,
      date,
      displayDate,
      title,
      description,
      icon,
      media ? JSON.stringify(media) : null,
      location?.lat ?? null,
      location?.lng ?? null,
      location?.label ?? null,
      visible !== false,
    ]
  );
  return toMilestone(rows[0]);
}

const UPDATABLE_FIELDS = {
  date: 'date',
  displayDate: 'display_date',
  title: 'title',
  description: 'description',
  icon: 'icon',
  visible: 'visible',
};

export async function updateMilestone(id, patch) {
  const fields = [];
  const values = [];
  let idx = 1;

  for (const [key, column] of Object.entries(UPDATABLE_FIELDS)) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = $${idx++}`);
      values.push(patch[key]);
    }
  }

  if (patch.media !== undefined) {
    fields.push(`media = $${idx++}`);
    values.push(patch.media ? JSON.stringify(patch.media) : null);
  }

  if (patch.location !== undefined) {
    fields.push(`location_lat = $${idx++}`);
    values.push(patch.location?.lat ?? null);
    fields.push(`location_lng = $${idx++}`);
    values.push(patch.location?.lng ?? null);
    fields.push(`location_label = $${idx++}`);
    values.push(patch.location?.label ?? null);
  }

  if (fields.length === 0) return getMilestone(id);

  fields.push('updated_at = NOW()');
  values.push(id);

  const { rows } = await query(
    `UPDATE timeline_milestones SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0] ? toMilestone(rows[0]) : null;
}

export async function deleteMilestone(id) {
  const { rowCount } = await query(`DELETE FROM timeline_milestones WHERE id = $1`, [id]);
  return rowCount > 0;
}

/** Reorders milestones to match the given array of ids (top-to-bottom). */
export async function reorderMilestones(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return listMilestones();

  const cases = [];
  const values = [];
  let idx = 1;
  ids.forEach((id, i) => {
    cases.push(`WHEN id = $${idx++} THEN $${idx++}`);
    values.push(id, (i + 1) * 10);
  });
  values.push(ids);

  await query(
    `UPDATE timeline_milestones
     SET sort_order = CASE ${cases.join(' ')} ELSE sort_order END,
         updated_at = NOW()
     WHERE id = ANY($${idx}::uuid[])`,
    values
  );
  return listMilestones();
}
