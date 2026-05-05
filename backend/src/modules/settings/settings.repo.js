import { query } from '../../db.js';

const ALLOWED = ['shop_name', 'hero_title', 'hero_subtitle', 'logo_url', 'games_title', 'games_subtitle'];

export async function getAllSettings() {
  const { rows } = await query(`SELECT key, value FROM settings`);
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function updateSettings(patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (!ALLOWED.includes(key)) continue;
    await query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, value],
    );
  }
  return getAllSettings();
}
