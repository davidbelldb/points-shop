import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';

/**
 * TimelinePageSettingsEditor
 * ---------------------------
 * Lets the admin set the heading text shown at the top of /timeline
 * (defaults to "Our Story So Far" / "Every little moment, mapped out one
 * milestone at a time." if left blank). Saved to the generic `settings`
 * table (timeline_title / timeline_subtitle) via /api/admin/settings, so it
 * applies everywhere - not just the browser that set it.
 */
export default function TimelinePageSettingsEditor() {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [mapLat, setMapLat] = useState('');
  const [mapLng, setMapLng] = useState('');
  const [mapZoom, setMapZoom] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSettings()
      .then((settings) => {
        if (cancelled) return;
        setTitle(settings?.timeline_title ?? '');
        setSubtitle(settings?.timeline_subtitle ?? '');
        setMapLat(settings?.timeline_map_center_lat ?? '');
        setMapLng(settings?.timeline_map_center_lng ?? '');
        setMapZoom(settings?.timeline_map_zoom ?? '');
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
  }, []);

  const persist = (patch) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setSaving(true);
      api.admin
        .updateSettings(patch)
        .catch(() => {})
        .finally(() => setSaving(false));
    }, 600);
  };

  if (!loaded) {
    return <p className="text-sm text-neutral-500">Loading page settings…</p>;
  }

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-800">Timeline page heading</h3>
        {saving && <span className="text-xs text-neutral-400">Saving…</span>}
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            persist({ timeline_title: e.target.value });
          }}
          placeholder="Our Story So Far"
          className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-500">Subtitle</span>
        <input
          type="text"
          value={subtitle}
          onChange={(e) => {
            setSubtitle(e.target.value);
            persist({ timeline_subtitle: e.target.value });
          }}
          placeholder="Every little moment, mapped out one milestone at a time."
          className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
        />
      </label>

      <div className="border-t border-neutral-200 pt-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-800">Overview map position</h3>
          <button
            type="button"
            onClick={() => {
              setMapLat('');
              setMapLng('');
              setMapZoom('');
              persist({ timeline_map_center_lat: '', timeline_map_center_lng: '', timeline_map_zoom: '' });
            }}
            className="text-xs font-medium text-amber-700 hover:text-amber-900"
          >
            Reset to auto-fit
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          By default the map zooms/pans to fit every pinned milestone. Set these to pin it to an
          exact centre and zoom instead - leave all three blank to go back to auto-fit.
        </p>

        <div className="mt-2 grid grid-cols-3 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">Centre latitude</span>
            <input
              type="number"
              step="any"
              value={mapLat}
              onChange={(e) => {
                setMapLat(e.target.value);
                persist({ timeline_map_center_lat: e.target.value });
              }}
              placeholder="e.g. 52.205"
              className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">Centre longitude</span>
            <input
              type="number"
              step="any"
              value={mapLng}
              onChange={(e) => {
                setMapLng(e.target.value);
                persist({ timeline_map_center_lng: e.target.value });
              }}
              placeholder="e.g. 0.119"
              className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">Zoom</span>
            <input
              type="number"
              step="any"
              value={mapZoom}
              onChange={(e) => {
                setMapZoom(e.target.value);
                persist({ timeline_map_zoom: e.target.value });
              }}
              placeholder="e.g. 13"
              className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
