import { query } from '../../db.js';

export async function getCrossword() {
  const { rows } = await query(`SELECT title, words FROM crossword WHERE id = 1`);
  return rows[0] ?? { title: 'Crossword', words: [] };
}

export async function saveCrossword(title, words) {
  const { rows } = await query(
    `INSERT INTO crossword (id, title, words, updated_at)
     VALUES (1, $1, $2::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, words = EXCLUDED.words, updated_at = NOW()
     RETURNING title, words`,
    [title || 'Crossword', JSON.stringify(words)],
  );
  return rows[0];
}
