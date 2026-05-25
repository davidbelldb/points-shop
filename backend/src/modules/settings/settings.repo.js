import { query } from '../../db.js';

const ALLOWED = [
  'shop_name', 'hero_title', 'hero_subtitle', 'logo_url', 'games_title', 'games_subtitle',
  'banner_enabled', 'banner_text', 'banner_bg_colour', 'banner_text_colour',
  'banner_countdown_date',
  'audio_section_enabled', 'audio_title', 'audio_subtitle',
];

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
