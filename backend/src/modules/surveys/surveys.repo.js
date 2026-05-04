import { query } from '../../db.js';

const SURVEY_FIELDS = ['title', 'subtitle', 'asterisk_text', 'is_active'];
const QUESTION_FIELDS = ['question_text', 'question_type', 'options', 'sort_order', 'is_required'];

export async function listAllSurveys() {
  const surveys = await query(`SELECT * FROM surveys ORDER BY created_at DESC`);
  const out = [];
  for (const s of surveys.rows) {
    const qs = await query(
      `SELECT id, question_text, question_type, options, sort_order, is_required
         FROM survey_questions WHERE survey_id = $1 ORDER BY sort_order, created_at`,
      [s.id],
    );
    out.push({ ...s, questions: qs.rows });
  }
  return out;
}

export async function getSurveyById(id) {
  const surveyRes = await query(`SELECT * FROM surveys WHERE id = $1`, [id]);
  if (surveyRes.rows.length === 0) return null;
  const qs = await query(
    `SELECT id, question_text, question_type, options, sort_order, is_required
       FROM survey_questions WHERE survey_id = $1 ORDER BY sort_order, created_at`,
    [id],
  );
  return { ...surveyRes.rows[0], questions: qs.rows };
}

export async function getActiveSurvey() {
  const r = await query(`SELECT * FROM surveys WHERE is_active = TRUE ORDER BY updated_at DESC LIMIT 1`);
  if (r.rows.length === 0) return null;
  const s = r.rows[0];
  const qs = await query(
    `SELECT id, question_text, question_type, options, sort_order, is_required
       FROM survey_questions WHERE survey_id = $1 ORDER BY sort_order, created_at`,
    [s.id],
  );
  return { ...s, questions: qs.rows };
}

export async function createSurvey(d) {
  const { rows } = await query(
    `INSERT INTO surveys (title, subtitle, asterisk_text, is_active)
     VALUES ($1, $2, $3, COALESCE($4, FALSE)) RETURNING *`,
    [d.title, d.subtitle ?? null, d.asterisk_text ?? null, d.is_active],
  );
  return { ...rows[0], questions: [] };
}

export async function updateSurvey(id, patch) {
  const fields = [];
  const values = [];
  let i = 1;
  for (const k of SURVEY_FIELDS) {
    if (k in patch) { fields.push(`${k} = $${i++}`); values.push(patch[k]); }
  }
  if (fields.length === 0) return getSurveyById(id);
  fields.push('updated_at = NOW()');
  values.push(id);
  await query(`UPDATE surveys SET ${fields.join(', ')} WHERE id = $${i}`, values);
  return getSurveyById(id);
}

export async function deleteSurvey(id) {
  await query(`DELETE FROM surveys WHERE id = $1`, [id]);
}

export async function createQuestion(surveyId, d) {
  const r = await query(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM survey_questions WHERE survey_id = $1`,
    [surveyId],
  );
  const nextOrder = r.rows[0].next;
  const { rows } = await query(
    `INSERT INTO survey_questions
       (survey_id, question_text, question_type, options, sort_order, is_required)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, FALSE)) RETURNING *`,
    [surveyId, d.question_text, d.question_type, d.options ?? null, d.sort_order ?? nextOrder, d.is_required],
  );
  return rows[0];
}

export async function updateQuestion(id, patch) {
  const fields = [];
  const values = [];
  let i = 1;
  for (const k of QUESTION_FIELDS) {
    if (k in patch) { fields.push(`${k} = $${i++}`); values.push(patch[k]); }
  }
  if (fields.length === 0) {
    const { rows } = await query(`SELECT * FROM survey_questions WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }
  values.push(id);
  const { rows } = await query(
    `UPDATE survey_questions SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteQuestion(id) {
  await query(`DELETE FROM survey_questions WHERE id = $1`, [id]);
}
