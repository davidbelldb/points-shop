import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useSettings } from '../lib/SettingsContext.jsx';

const numInputCls =
  'w-20 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none text-right font-mono';
const colourInputCls =
  'w-24 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none font-mono';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Defaults mirrored from Magic8BallPage.jsx — used to seed the inputs when
// no override has been saved yet.
const DEFAULTS = {
  magic8ball_scene_background_color: '#05050c',
  magic8ball_camera_x: '0',
  magic8ball_camera_y: '0.3',
  magic8ball_camera_z: '4',
  magic8ball_camera_fov: '35',
  magic8ball_intro_camera_x: '0',
  magic8ball_intro_camera_y: '1.6',
  magic8ball_intro_camera_z: '-9.5',
  magic8ball_intro_camera_fov: '42',
  magic8ball_reset_camera_x: '0',
  magic8ball_reset_camera_y: '0.3',
  magic8ball_reset_camera_z: '4',
  magic8ball_reset_camera_fov: '35',
  magic8ball_light_ambient_intensity: '0.55',
  magic8ball_light_ambient_color: '#ffffff',
  magic8ball_light_dir1_intensity: '1',
  magic8ball_light_dir2_intensity: '0.3',
  magic8ball_light_point_intensity: '0.8',
  magic8ball_light_point_color: '#88aaff',
  magic8ball_question_title: 'Need Help Choosing\na Movie or Game?',
  magic8ball_question_color: '#b7b7f7',
  magic8ball_question_opacity: '1',
  magic8ball_question_depth: '1',
  magic8ball_question_y: '0.62',
  magic8ball_filter_color: '#000000',
  magic8ball_filter_opacity: '0.45',
  magic8ball_filter_depth: '1',
  magic8ball_selection_depth: '1',
  magic8ball_movies_y: '0.05',
  magic8ball_games_y: '-0.22',
  magic8ball_result_text_depth: '0.055',
  magic8ball_die_depth_start: '0.85',
  magic8ball_die_depth_end: '1.15',
  magic8ball_result_face_pop: '0',
  magic8ball_result_face_color: '#100c7f',
  magic8ball_reveal_lead_ms: '500',
  magic8ball_confirm_text: 'Okay, then.\nGive me a shake!',
  magic8ball_confirm_color: '#b7b7f7',
  magic8ball_confirm_font_size: '0.1',
  magic8ball_confirm_depth: '1',
  magic8ball_confirm_x: '0',
  magic8ball_confirm_y: '-0.05',
  magic8ball_glass_opacity: '0.12',
  magic8ball_glass_scale: '1',
  magic8ball_glass_thinness: '0.05',
  magic8ball_glass_depth: '1.05',
  magic8ball_glass_glare_opacity: '0.25',
  magic8ball_glass_glare_color: '#ffd9a6',
  magic8ball_rear_title_text: 'Sneaky 8 Ball',
  magic8ball_rear_title_color: '#b7b7f7',
  magic8ball_rear_title_font_size: '0.34',
  magic8ball_rear_title_y: '0',
  magic8ball_rear_title_depth: '-1.55',
};

export default function AdminMagic8BallSection({ bare = false }) {
  const { settings, refresh } = useSettings();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const [vals, setVals] = useState(DEFAULTS);

  useEffect(() => {
    setVals((v) => {
      const next = { ...v };
      for (const key of Object.keys(DEFAULTS)) {
        if (settings[key] !== undefined) next[key] = settings[key];
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.magic8ball_scene_background_color,
    settings.magic8ball_camera_x,
    settings.magic8ball_camera_y,
    settings.magic8ball_camera_z,
    settings.magic8ball_camera_fov,
    settings.magic8ball_intro_camera_x,
    settings.magic8ball_intro_camera_y,
    settings.magic8ball_intro_camera_z,
    settings.magic8ball_intro_camera_fov,
    settings.magic8ball_reset_camera_x,
    settings.magic8ball_reset_camera_y,
    settings.magic8ball_reset_camera_z,
    settings.magic8ball_reset_camera_fov,
    settings.magic8ball_light_ambient_intensity,
    settings.magic8ball_light_ambient_color,
    settings.magic8ball_light_dir1_intensity,
    settings.magic8ball_light_dir2_intensity,
    settings.magic8ball_light_point_intensity,
    settings.magic8ball_light_point_color,
    settings.magic8ball_question_title,
    settings.magic8ball_question_color,
    settings.magic8ball_question_opacity,
    settings.magic8ball_question_depth,
    settings.magic8ball_question_y,
    settings.magic8ball_filter_color,
    settings.magic8ball_filter_opacity,
    settings.magic8ball_filter_depth,
    settings.magic8ball_selection_depth,
    settings.magic8ball_movies_y,
    settings.magic8ball_games_y,
    settings.magic8ball_result_text_depth,
    settings.magic8ball_die_depth_start,
    settings.magic8ball_die_depth_end,
    settings.magic8ball_result_face_pop,
    settings.magic8ball_result_face_color,
    settings.magic8ball_reveal_lead_ms,
    settings.magic8ball_confirm_text,
    settings.magic8ball_confirm_color,
    settings.magic8ball_confirm_font_size,
    settings.magic8ball_confirm_depth,
    settings.magic8ball_confirm_x,
    settings.magic8ball_confirm_y,
    settings.magic8ball_glass_opacity,
    settings.magic8ball_glass_scale,
    settings.magic8ball_glass_thinness,
    settings.magic8ball_glass_depth,
    settings.magic8ball_glass_glare_opacity,
    settings.magic8ball_glass_glare_color,
    settings.magic8ball_rear_title_text,
    settings.magic8ball_rear_title_color,
    settings.magic8ball_rear_title_font_size,
    settings.magic8ball_rear_title_y,
    settings.magic8ball_rear_title_depth,
  ]);

  function setVal(key, value) {
    setVals((v) => ({ ...v, [key]: value }));
  }

  async function save(key, value) {
    setBusy(true); setError(null); setSaved(false);
    try {
      await api.admin.updateSettings({ [key]: String(value) });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  function commitNumber(key, fallback) {
    const n = parseFloat(vals[key]);
    const value = Number.isFinite(n) ? n : fallback;
    setVal(key, String(value));
    save(key, value);
  }

  function commitColour(key) {
    if (!HEX_RE.test(vals[key])) {
      setError(`${key} must be a hex colour like #88aaff`);
      return;
    }
    save(key, vals[key]);
  }

  function commitText(key) {
    save(key, vals[key]);
  }

  const savedIndicator = saved && <span className="text-xs text-emerald-600">Saved ✓</span>;

  const body = (
    <div className="space-y-3">
      {savedIndicator}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Scene</p>
        <p className="text-xs text-neutral-500">
          Background colour behind the 8-ball &mdash; fades to near-black toward the edges.
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Background colour</span>
            <div className="flex items-center gap-1">
              {HEX_RE.test(vals.magic8ball_scene_background_color) && (
                <span className="inline-block h-5 w-5 rounded border border-neutral-300 shrink-0" style={{ background: vals.magic8ball_scene_background_color }} />
              )}
              <input
                value={vals.magic8ball_scene_background_color}
                onChange={(e) => setVal('magic8ball_scene_background_color', e.target.value)}
                onBlur={() => commitColour('magic8ball_scene_background_color')}
                className={colourInputCls}
                placeholder="#05050c"
                maxLength={7}
              />
            </div>
          </label>
        </div>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Camera</p>
        <p className="text-xs text-neutral-500">
          X is left/right, Y is height, Z is distance toward you. FOV widens or narrows the view. Changes apply on page reload.
        </p>

        <div className="space-y-1">
          <p className="text-xs font-medium text-neutral-600">Start (on load)</p>
          <p className="text-xs text-neutral-500">
            Where the camera begins on page load. A negative Pos Z starts the camera behind the ball (showing the rear title),
            then it arcs round to the End position, passing the rear title on the way.
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {[
              { label: 'Pos X', key: 'magic8ball_intro_camera_x', fallback: 0 },
              { label: 'Pos Y (height)', key: 'magic8ball_intro_camera_y', fallback: 1.6 },
              { label: 'Pos Z (distance)', key: 'magic8ball_intro_camera_z', fallback: -9.5 },
              { label: 'FOV °', key: 'magic8ball_intro_camera_fov', fallback: 42 },
            ].map(({ label, key, fallback }) => (
              <label key={key} className="flex items-center justify-between gap-2">
                <span className="text-neutral-500">{label}</span>
                <input
                  value={vals[key]}
                  type="number"
                  step="0.1"
                  onChange={(e) => setVal(key, e.target.value)}
                  onBlur={() => commitNumber(key, fallback)}
                  className={numInputCls}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-neutral-600">End (settled)</p>
          <p className="text-xs text-neutral-500">
            Where the camera settles once it arrives on the 8-ball window (select / confirm / shaking / answer phases).
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {[
              { label: 'Pos X', key: 'magic8ball_camera_x', fallback: 0 },
              { label: 'Pos Y (height)', key: 'magic8ball_camera_y', fallback: 0.3 },
              { label: 'Pos Z (distance)', key: 'magic8ball_camera_z', fallback: 4 },
              { label: 'FOV °', key: 'magic8ball_camera_fov', fallback: 35 },
            ].map(({ label, key, fallback }) => (
              <label key={key} className="flex items-center justify-between gap-2">
                <span className="text-neutral-500">{label}</span>
                <input
                  value={vals[key]}
                  type="number"
                  step="0.1"
                  onChange={(e) => setVal(key, e.target.value)}
                  onBlur={() => commitNumber(key, fallback)}
                  className={numInputCls}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-neutral-600">Reset (double-tap)</p>
          <p className="text-xs text-neutral-500">
            Where double-tapping the window returns the camera to, after any pinch-zoom or two-finger orbit. Independent
            of the End position above, so you can set a different &quot;home&quot; view.
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {[
              { label: 'Pos X', key: 'magic8ball_reset_camera_x', fallback: 0 },
              { label: 'Pos Y (height)', key: 'magic8ball_reset_camera_y', fallback: 0.3 },
              { label: 'Pos Z (distance)', key: 'magic8ball_reset_camera_z', fallback: 4 },
              { label: 'FOV °', key: 'magic8ball_reset_camera_fov', fallback: 35 },
            ].map(({ label, key, fallback }) => (
              <label key={key} className="flex items-center justify-between gap-2">
                <span className="text-neutral-500">{label}</span>
                <input
                  value={vals[key]}
                  type="number"
                  step="0.1"
                  onChange={(e) => setVal(key, e.target.value)}
                  onBlur={() => commitNumber(key, fallback)}
                  className={numInputCls}
                />
              </label>
            ))}
          </div>
        </div>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Lighting</p>
        <p className="text-xs text-neutral-500">
          Matches Shut the Box 15&apos;s day-mode rig by default. Ambient lights the whole scene evenly; the two
          directional lights add highlights/shading; the point light adds a coloured glow accent.
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Ambient brightness</span>
            <input
              value={vals.magic8ball_light_ambient_intensity}
              type="number" min="0" max="5" step="0.05"
              onChange={(e) => setVal('magic8ball_light_ambient_intensity', e.target.value)}
              onBlur={() => commitNumber('magic8ball_light_ambient_intensity', 0.55)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Ambient colour</span>
            <div className="flex items-center gap-1">
              {HEX_RE.test(vals.magic8ball_light_ambient_color) && (
                <span className="inline-block h-5 w-5 rounded border border-neutral-300 shrink-0" style={{ background: vals.magic8ball_light_ambient_color }} />
              )}
              <input
                value={vals.magic8ball_light_ambient_color}
                onChange={(e) => setVal('magic8ball_light_ambient_color', e.target.value)}
                onBlur={() => commitColour('magic8ball_light_ambient_color')}
                className={colourInputCls}
                placeholder="#ffffff"
                maxLength={7}
              />
            </div>
          </label>

          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Directional 1 brightness</span>
            <input
              value={vals.magic8ball_light_dir1_intensity}
              type="number" min="0" max="5" step="0.05"
              onChange={(e) => setVal('magic8ball_light_dir1_intensity', e.target.value)}
              onBlur={() => commitNumber('magic8ball_light_dir1_intensity', 1)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Directional 2 brightness</span>
            <input
              value={vals.magic8ball_light_dir2_intensity}
              type="number" min="0" max="5" step="0.05"
              onChange={(e) => setVal('magic8ball_light_dir2_intensity', e.target.value)}
              onBlur={() => commitNumber('magic8ball_light_dir2_intensity', 0.3)}
              className={numInputCls}
            />
          </label>

          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Point light brightness</span>
            <input
              value={vals.magic8ball_light_point_intensity}
              type="number" min="0" max="10" step="0.1"
              onChange={(e) => setVal('magic8ball_light_point_intensity', e.target.value)}
              onBlur={() => commitNumber('magic8ball_light_point_intensity', 0.8)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Point light colour</span>
            <div className="flex items-center gap-1">
              {HEX_RE.test(vals.magic8ball_light_point_color) && (
                <span className="inline-block h-5 w-5 rounded border border-neutral-300 shrink-0" style={{ background: vals.magic8ball_light_point_color }} />
              )}
              <input
                value={vals.magic8ball_light_point_color}
                onChange={(e) => setVal('magic8ball_light_point_color', e.target.value)}
                onBlur={() => commitColour('magic8ball_light_point_color')}
                className={colourInputCls}
                placeholder="#88aaff"
                maxLength={7}
              />
            </div>
          </label>
        </div>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Question text</p>
        <p className="text-xs text-neutral-500">
          The heading shown while picking Movies or Games. Depth is the distance toward the camera (bigger = closer to the glass).
          The &quot;Movies&quot;/&quot;Games&quot; picker text and the &quot;Okay, then. Give me a shake!&quot; prompt are
          detached from the die and sit fixed in the window alongside this heading &mdash; they share its font size and
          colour, with their own depth below.
        </p>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-neutral-500">Title text (use a blank line to break onto a new line)</span>
          <textarea
            value={vals.magic8ball_question_title}
            onChange={(e) => setVal('magic8ball_question_title', e.target.value)}
            onBlur={() => commitText('magic8ball_question_title')}
            rows={2}
            className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none font-mono"
          />
        </label>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Text colour</span>
            <div className="flex items-center gap-1">
              {HEX_RE.test(vals.magic8ball_question_color) && (
                <span className="inline-block h-5 w-5 rounded border border-neutral-300 shrink-0" style={{ background: vals.magic8ball_question_color }} />
              )}
              <input
                value={vals.magic8ball_question_color}
                onChange={(e) => setVal('magic8ball_question_color', e.target.value)}
                onBlur={() => commitColour('magic8ball_question_color')}
                className={colourInputCls}
                placeholder="#b7b7f7"
                maxLength={7}
              />
            </div>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Opacity (0-1)</span>
            <input
              value={vals.magic8ball_question_opacity}
              type="number" min="0" max="1" step="0.05"
              onChange={(e) => setVal('magic8ball_question_opacity', e.target.value)}
              onBlur={() => commitNumber('magic8ball_question_opacity', 1)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Title depth</span>
            <input
              value={vals.magic8ball_question_depth}
              type="number" step="0.05"
              onChange={(e) => setVal('magic8ball_question_depth', e.target.value)}
              onBlur={() => commitNumber('magic8ball_question_depth', 1)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Title Y position</span>
            <input
              value={vals.magic8ball_question_y}
              type="number" step="0.05"
              onChange={(e) => setVal('magic8ball_question_y', e.target.value)}
              onBlur={() => commitNumber('magic8ball_question_y', 0.62)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">&quot;Movies&quot;/&quot;Games&quot; depth</span>
            <input
              value={vals.magic8ball_selection_depth}
              type="number" step="0.05"
              onChange={(e) => setVal('magic8ball_selection_depth', e.target.value)}
              onBlur={() => commitNumber('magic8ball_selection_depth', 1)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">&quot;Movies&quot; Y position</span>
            <input
              value={vals.magic8ball_movies_y}
              type="number" step="0.05"
              onChange={(e) => setVal('magic8ball_movies_y', e.target.value)}
              onBlur={() => commitNumber('magic8ball_movies_y', 0.05)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">&quot;Games&quot; Y position</span>
            <input
              value={vals.magic8ball_games_y}
              type="number" step="0.05"
              onChange={(e) => setVal('magic8ball_games_y', e.target.value)}
              onBlur={() => commitNumber('magic8ball_games_y', -0.22)}
              className={numInputCls}
            />
          </label>
        </div>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Confirm prompt</p>
        <p className="text-xs text-neutral-500">
          The &quot;Okay, then. Give me a shake!&quot; message shown after picking Movies or Games &mdash; fixed in the
          window like the question title. X/Y position is relative to the centre of the window (right/up are positive).
        </p>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-neutral-500">Prompt text (use a blank line to break onto a new line)</span>
          <textarea
            value={vals.magic8ball_confirm_text}
            onChange={(e) => setVal('magic8ball_confirm_text', e.target.value)}
            onBlur={() => commitText('magic8ball_confirm_text')}
            rows={2}
            className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none font-mono"
          />
        </label>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Text colour</span>
            <div className="flex items-center gap-1">
              {HEX_RE.test(vals.magic8ball_confirm_color) && (
                <span className="inline-block h-5 w-5 rounded border border-neutral-300 shrink-0" style={{ background: vals.magic8ball_confirm_color }} />
              )}
              <input
                value={vals.magic8ball_confirm_color}
                onChange={(e) => setVal('magic8ball_confirm_color', e.target.value)}
                onBlur={() => commitColour('magic8ball_confirm_color')}
                className={colourInputCls}
                placeholder="#b7b7f7"
                maxLength={7}
              />
            </div>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Font size</span>
            <input
              value={vals.magic8ball_confirm_font_size}
              type="number" step="0.005" min="0"
              onChange={(e) => setVal('magic8ball_confirm_font_size', e.target.value)}
              onBlur={() => commitNumber('magic8ball_confirm_font_size', 0.1)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Depth</span>
            <input
              value={vals.magic8ball_confirm_depth}
              type="number" step="0.05"
              onChange={(e) => setVal('magic8ball_confirm_depth', e.target.value)}
              onBlur={() => commitNumber('magic8ball_confirm_depth', 1)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">X position</span>
            <input
              value={vals.magic8ball_confirm_x}
              type="number" step="0.05"
              onChange={(e) => setVal('magic8ball_confirm_x', e.target.value)}
              onBlur={() => commitNumber('magic8ball_confirm_x', 0)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Y position</span>
            <input
              value={vals.magic8ball_confirm_y}
              type="number" step="0.05"
              onChange={(e) => setVal('magic8ball_confirm_y', e.target.value)}
              onBlur={() => commitNumber('magic8ball_confirm_y', -0.05)}
              className={numInputCls}
            />
          </label>
        </div>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Liquid cover</p>
        <p className="text-xs text-neutral-500">
          The thin semi-opaque pane that sits in front of the die at rest, giving the window its murky look.
          Depth is the distance toward the camera.
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Cover colour</span>
            <div className="flex items-center gap-1">
              {HEX_RE.test(vals.magic8ball_filter_color) && (
                <span className="inline-block h-5 w-5 rounded border border-neutral-300 shrink-0" style={{ background: vals.magic8ball_filter_color }} />
              )}
              <input
                value={vals.magic8ball_filter_color}
                onChange={(e) => setVal('magic8ball_filter_color', e.target.value)}
                onBlur={() => commitColour('magic8ball_filter_color')}
                className={colourInputCls}
                placeholder="#000000"
                maxLength={7}
              />
            </div>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Opacity (0-1)</span>
            <input
              value={vals.magic8ball_filter_opacity}
              type="number" min="0" max="1" step="0.05"
              onChange={(e) => setVal('magic8ball_filter_opacity', e.target.value)}
              onBlur={() => commitNumber('magic8ball_filter_opacity', 0.45)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Depth</span>
            <input
              value={vals.magic8ball_filter_depth}
              type="number" step="0.05"
              onChange={(e) => setVal('magic8ball_filter_depth', e.target.value)}
              onBlur={() => commitNumber('magic8ball_filter_depth', 1)}
              className={numInputCls}
            />
          </label>
        </div>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Glass cover</p>
        <p className="text-xs text-neutral-500">
          One last translucent pane over the whole window, in front of everything else, for a subtle &quot;under
          glass&quot; finish &mdash; plus a soft warm glare highlight near the top-left. Scale resizes the circular
          panel; thinness is how clear vs. frosted it looks (lower = thinner/clearer, higher = thicker/frosted);
          depth is how far toward the camera it sits.
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Opacity (0-1)</span>
            <input
              value={vals.magic8ball_glass_opacity}
              type="number" min="0" max="1" step="0.01"
              onChange={(e) => setVal('magic8ball_glass_opacity', e.target.value)}
              onBlur={() => commitNumber('magic8ball_glass_opacity', 0.12)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Scale (size)</span>
            <input
              value={vals.magic8ball_glass_scale}
              type="number" min="0" step="0.01"
              onChange={(e) => setVal('magic8ball_glass_scale', e.target.value)}
              onBlur={() => commitNumber('magic8ball_glass_scale', 1)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Thinness (0-1)</span>
            <input
              value={vals.magic8ball_glass_thinness}
              type="number" min="0" max="1" step="0.01"
              onChange={(e) => setVal('magic8ball_glass_thinness', e.target.value)}
              onBlur={() => commitNumber('magic8ball_glass_thinness', 0.05)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Depth</span>
            <input
              value={vals.magic8ball_glass_depth}
              type="number" step="0.05"
              onChange={(e) => setVal('magic8ball_glass_depth', e.target.value)}
              onBlur={() => commitNumber('magic8ball_glass_depth', 1.05)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Glare opacity (0-1)</span>
            <input
              value={vals.magic8ball_glass_glare_opacity}
              type="number" min="0" max="1" step="0.01"
              onChange={(e) => setVal('magic8ball_glass_glare_opacity', e.target.value)}
              onBlur={() => commitNumber('magic8ball_glass_glare_opacity', 0.25)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Glare colour</span>
            <div className="flex items-center gap-1">
              {HEX_RE.test(vals.magic8ball_glass_glare_color) && (
                <span className="inline-block h-5 w-5 rounded border border-neutral-300 shrink-0" style={{ background: vals.magic8ball_glass_glare_color }} />
              )}
              <input
                value={vals.magic8ball_glass_glare_color}
                onChange={(e) => setVal('magic8ball_glass_glare_color', e.target.value)}
                onBlur={() => commitColour('magic8ball_glass_glare_color')}
                className={colourInputCls}
                placeholder="#ffd9a6"
                maxLength={7}
              />
            </div>
          </label>
        </div>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Rear title</p>
        <p className="text-xs text-neutral-500">
          A title on the back of the shell, opposite the window &mdash; revealed when the camera starts behind the
          ball on load and arcs round to the front, passing this title on the way. Size scales the text; Y moves it
          up/down; Depth moves it toward/away from the centre (more negative sits further round the back).
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <label className="col-span-2 flex items-center justify-between gap-2">
            <span className="text-neutral-500">Title text</span>
            <input
              value={vals.magic8ball_rear_title_text}
              onChange={(e) => setVal('magic8ball_rear_title_text', e.target.value)}
              onBlur={() => commitText('magic8ball_rear_title_text')}
              className="w-48 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
              placeholder="Sneaky 8 Ball"
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Size (font size)</span>
            <input
              value={vals.magic8ball_rear_title_font_size}
              type="number" min="0" step="0.01"
              onChange={(e) => setVal('magic8ball_rear_title_font_size', e.target.value)}
              onBlur={() => commitNumber('magic8ball_rear_title_font_size', 0.34)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Pos Y (height)</span>
            <input
              value={vals.magic8ball_rear_title_y}
              type="number" step="0.05"
              onChange={(e) => setVal('magic8ball_rear_title_y', e.target.value)}
              onBlur={() => commitNumber('magic8ball_rear_title_y', 0)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Depth</span>
            <input
              value={vals.magic8ball_rear_title_depth}
              type="number" step="0.05"
              onChange={(e) => setVal('magic8ball_rear_title_depth', e.target.value)}
              onBlur={() => commitNumber('magic8ball_rear_title_depth', -1.55)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Colour</span>
            <div className="flex items-center gap-1">
              {HEX_RE.test(vals.magic8ball_rear_title_color) && (
                <span className="inline-block h-5 w-5 rounded border border-neutral-300 shrink-0" style={{ background: vals.magic8ball_rear_title_color }} />
              )}
              <input
                value={vals.magic8ball_rear_title_color}
                onChange={(e) => setVal('magic8ball_rear_title_color', e.target.value)}
                onBlur={() => commitColour('magic8ball_rear_title_color')}
                className={colourInputCls}
                placeholder="#b7b7f7"
                maxLength={7}
              />
            </div>
          </label>
        </div>
      </div>

      <hr className="border-neutral-200" />

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Icosahedron &amp; result face</p>
        <p className="text-xs text-neutral-500">
          Start depth is the die&apos;s resting/tumbling position; end depth is where it settles once revealed (colours
          unchanged for now). Result face pop pushes just that one facet outward (positive) or inward (negative) for
          a relief effect. Result face end colour is the colour that facet fades to once revealed.
          Answer (result) text depth controls how far toward the camera the revealed answer text sits on the die face.
          Reveal fade duration is how long before the die finishes settling that the result colour and answer text
          fade in to 100% &mdash; the fade always finishes exactly when the die comes to rest.
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Start depth</span>
            <input
              value={vals.magic8ball_die_depth_start}
              type="number" step="0.05"
              onChange={(e) => setVal('magic8ball_die_depth_start', e.target.value)}
              onBlur={() => commitNumber('magic8ball_die_depth_start', 0.85)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">End depth</span>
            <input
              value={vals.magic8ball_die_depth_end}
              type="number" step="0.05"
              onChange={(e) => setVal('magic8ball_die_depth_end', e.target.value)}
              onBlur={() => commitNumber('magic8ball_die_depth_end', 1.15)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Result face pop</span>
            <input
              value={vals.magic8ball_result_face_pop}
              type="number" step="0.01"
              onChange={(e) => setVal('magic8ball_result_face_pop', e.target.value)}
              onBlur={() => commitNumber('magic8ball_result_face_pop', 0)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Result face end colour</span>
            <div className="flex items-center gap-1">
              {HEX_RE.test(vals.magic8ball_result_face_color) && (
                <span className="inline-block h-5 w-5 rounded border border-neutral-300 shrink-0" style={{ background: vals.magic8ball_result_face_color }} />
              )}
              <input
                value={vals.magic8ball_result_face_color}
                onChange={(e) => setVal('magic8ball_result_face_color', e.target.value)}
                onBlur={() => commitColour('magic8ball_result_face_color')}
                className={colourInputCls}
                placeholder="#100c7f"
                maxLength={7}
              />
            </div>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Reveal fade duration (ms)</span>
            <input
              value={vals.magic8ball_reveal_lead_ms}
              type="number" min="0" step="50"
              onChange={(e) => setVal('magic8ball_reveal_lead_ms', e.target.value)}
              onBlur={() => commitNumber('magic8ball_reveal_lead_ms', 500)}
              className={numInputCls}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-neutral-500">Answer (result) text depth</span>
            <input
              value={vals.magic8ball_result_text_depth}
              type="number" step="0.005"
              onChange={(e) => setVal('magic8ball_result_text_depth', e.target.value)}
              onBlur={() => commitNumber('magic8ball_result_text_depth', 0.055)}
              className={numInputCls}
            />
          </label>
        </div>
      </div>
    </div>
  );

  if (bare) return body;
  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Magic 8-Ball</h2>
        {savedIndicator}
      </div>
      {body}
    </section>
  );
}
