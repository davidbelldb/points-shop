import { query } from '../../db.js';

const ALLOWED = [
  'shop_name', 'hero_title', 'hero_subtitle', 'logo_url', 'games_title', 'games_subtitle',
  'timeline_theme', 'timeline_title', 'timeline_subtitle',
  'timeline_map_center_lat', 'timeline_map_center_lng', 'timeline_map_zoom',
  'banner_enabled', 'banner_text', 'banner_link_url', 'banner_bg_colour', 'banner_text_colour',
  'banner_countdown_date', 'banner_countdown_time',
  'audio_section_enabled', 'audio_title', 'audio_subtitle',
  'homepage_featured_enabled',
  'magic8ball_homepage_visible',
  'magic8ball_camera_x', 'magic8ball_camera_y', 'magic8ball_camera_z', 'magic8ball_camera_fov',
  'magic8ball_intro_camera_x', 'magic8ball_intro_camera_y', 'magic8ball_intro_camera_z', 'magic8ball_intro_camera_fov',
  'magic8ball_reset_camera_x', 'magic8ball_reset_camera_y', 'magic8ball_reset_camera_z', 'magic8ball_reset_camera_fov',
  'magic8ball_light_ambient_intensity', 'magic8ball_light_ambient_color',
  'magic8ball_light_dir1_intensity', 'magic8ball_light_dir2_intensity',
  'magic8ball_light_point_intensity', 'magic8ball_light_point_color',
  'magic8ball_question_title', 'magic8ball_question_color', 'magic8ball_question_opacity', 'magic8ball_question_depth',
  'magic8ball_question_y',
  'magic8ball_filter_color', 'magic8ball_filter_opacity', 'magic8ball_filter_depth',
  'magic8ball_die_depth_start', 'magic8ball_die_depth_end', 'magic8ball_result_face_pop',
  'magic8ball_result_face_color', 'magic8ball_selection_depth', 'magic8ball_movies_y', 'magic8ball_games_y',
  'magic8ball_result_text_depth',
  'magic8ball_reveal_lead_ms', 'magic8ball_scene_background_color',
  'magic8ball_confirm_text', 'magic8ball_confirm_color', 'magic8ball_confirm_font_size',
  'magic8ball_confirm_depth', 'magic8ball_confirm_x', 'magic8ball_confirm_y',
  'magic8ball_glass_opacity', 'magic8ball_glass_scale', 'magic8ball_glass_thinness',
  'magic8ball_glass_depth', 'magic8ball_glass_glare_opacity', 'magic8ball_glass_glare_color',
  'magic8ball_rear_title_text', 'magic8ball_rear_title_color', 'magic8ball_rear_title_font_size',
  'magic8ball_rear_title_y', 'magic8ball_rear_title_depth',
  'entertainment_home_enabled', 'entertainment_home_days',
  'entertainment_home_start', 'entertainment_home_end',
  'entertainment_home_title', 'entertainment_home_subtitle',
  'floating_head_admin', 'floating_head_partner',
  'crossword_open',
  // Wording the apps render, so the same screen can say "safe pocket" for one
  // audience and "basket" for another.
  'basket_label', 'basket_add_label', 'basket_empty_text',
  'checkout_label', 'products_title', 'order_done_text',
];

// Adult values are the base; a kids account gets those with its own overrides
// laid on top, so only the wording that differs needs a second row.
export async function getAllSettings(audience = 'adult') {
  const { rows } = await query(
    `SELECT DISTINCT ON (key) key, value
       FROM settings
      WHERE audience = 'adult' OR audience = $1
      ORDER BY key, (audience = $1) DESC`,
    [audience],
  );
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function updateSettings(patch, audience = 'adult') {
  const target = audience === 'kids' ? 'kids' : 'adult';
  for (const [key, value] of Object.entries(patch)) {
    if (!ALLOWED.includes(key)) continue;
    await query(
      `INSERT INTO settings (audience, key, value, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (audience, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [target, key, value],
    );
  }
  return getAllSettings(target);
}
