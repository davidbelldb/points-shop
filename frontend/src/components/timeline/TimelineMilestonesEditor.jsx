import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, MapPin, Plus, Search, Trash2, UploadCloud, X } from 'lucide-react';
import { api } from '../../lib/api';
import { iconNames } from './icons';

const EMPTY_FORM = {
  date: '',
  displayDate: '',
  title: '',
  description: '',
  icon: 'Heart',
  media: null,
  location: null,
  visible: true,
};

/**
 * TimelineMilestonesEditor
 * -------------------------
 * Admin CRUD for Relationship Timeline milestones. Replaces the old
 * hardcoded frontend/src/data/milestones.js — every event (date, title,
 * description, icon, media, map location) is now stored in the
 * `timeline_milestones` table and managed here.
 *
 * Locations are looked up via the server-side Google Places proxy
 * (/api/admin/places/search) so coordinates are picked from real search
 * results rather than guessed.
 */
export default function TimelineMilestonesEditor() {
  const [milestones, setMilestones] = useState(null);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null); // milestone id, or 'new', or null
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    api.admin
      .listTimelineMilestones()
      .then(setMilestones)
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const move = async (index, dir) => {
    const target = index + dir;
    if (!milestones || target < 0 || target >= milestones.length) return;
    const reordered = [...milestones];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setMilestones(reordered);
    try {
      await api.admin.reorderTimelineMilestones(reordered.map((m) => m.id));
    } catch (err) {
      setError(err.message);
      load();
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this milestone? This can\'t be undone.')) return;
    setBusyId(id);
    try {
      await api.admin.deleteTimelineMilestone(id);
      setMilestones((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const toggleVisible = async (m) => {
    setBusyId(m.id);
    try {
      const updated = await api.admin.updateTimelineMilestone(m.id, { visible: !m.visible });
      setMilestones((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (error) {
    return <p className="text-sm text-rose-600">Couldn't load milestones: {error}</p>;
  }
  if (!milestones) {
    return <p className="text-sm text-neutral-500">Loading milestones…</p>;
  }

  return (
    <div className="space-y-3">
      {milestones.map((m, i) => (
        <div key={m.id}>
          {editingId === m.id ? (
            <MilestoneForm
              initial={m}
              onCancel={() => setEditingId(null)}
              onSaved={(updated) => {
                setMilestones((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                setEditingId(null);
              }}
            />
          ) : (
            <div
              className={`flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 ${
                m.visible === false ? 'opacity-50' : ''
              }`}
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="text-neutral-400 hover:text-neutral-700 disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === milestones.length - 1}
                  className="text-neutral-400 hover:text-neutral-700 disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-800">
                  {m.title || '(untitled)'}
                  {m.visible === false && (
                    <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                      Hidden
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-neutral-500">
                  {m.displayDate || m.date}
                  {m.location && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-neutral-400">
                      <MapPin className="h-3 w-3" />
                      {m.location.label || `${m.location.lat.toFixed(3)}, ${m.location.lng.toFixed(3)}`}
                    </span>
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() => toggleVisible(m)}
                disabled={busyId === m.id}
                className="rounded-full border border-neutral-200 p-1.5 text-neutral-400 hover:text-amber-700 hover:border-amber-300 disabled:opacity-50"
                aria-label={m.visible === false ? 'Show on timeline' : 'Hide from timeline'}
                title={m.visible === false ? 'Hidden — click to show on /timeline' : 'Visible — click to hide from /timeline'}
              >
                {m.visible === false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setEditingId(m.id)}
                className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600 hover:text-amber-700 hover:border-amber-300"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => remove(m.id)}
                disabled={busyId === m.id}
                className="rounded-full border border-neutral-200 p-1.5 text-neutral-400 hover:text-rose-600 hover:border-rose-300 disabled:opacity-50"
                aria-label="Delete milestone"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      ))}

      {editingId === 'new' ? (
        <MilestoneForm
          initial={EMPTY_FORM}
          onCancel={() => setEditingId(null)}
          onSaved={(created) => {
            setMilestones((prev) => [...prev, created]);
            setEditingId(null);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingId('new')}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-300 py-2.5 text-sm font-medium text-neutral-500 hover:text-amber-700 hover:border-amber-300"
        >
          <Plus className="h-4 w-4" />
          Add milestone
        </button>
      )}
    </div>
  );
}

function MilestoneForm({ initial, onCancel, onSaved }) {
  const [form, setForm] = useState({
    date: initial.date ?? '',
    displayDate: initial.displayDate ?? '',
    title: initial.title ?? '',
    description: initial.description ?? '',
    icon: initial.icon ?? 'Heart',
    media: initial.media ?? null,
    location: initial.location ?? null,
    visible: initial.visible ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await api.admin.upload(file);
      const type = result.mimetype === 'image/gif' ? 'gif' : 'image';
      set({
        media: {
          url: result.url,
          type,
          alt: form.media?.alt ?? '',
          size: form.media?.size ?? 'md',
        },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.date.trim()) {
      setError('Date is required (e.g. 2026-06-13, 2026-06, or 2026).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        date: form.date.trim(),
        displayDate: form.displayDate.trim(),
        title: form.title.trim(),
        description: form.description,
        icon: form.icon,
        media: form.media,
        location: form.location,
        visible: form.visible,
      };
      const saved =
        initial.id != null
          ? await api.admin.updateTimelineMilestone(initial.id, payload)
          : await api.admin.createTimelineMilestone(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const hasMedia = !!form.media;

  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Date (sortable, e.g. 2026-06-13)">
          <input
            type="text"
            value={form.date}
            onChange={(e) => set({ date: e.target.value })}
            placeholder="2026-06-13"
            className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
          />
        </Field>
        <Field label="Display date">
          <input
            type="text"
            value={form.displayDate}
            onChange={(e) => set({ displayDate: e.target.value })}
            placeholder="13 June 2026"
            className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
          />
        </Field>
      </div>

      <Field label="Title">
        <input
          type="text"
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
        />
      </Field>

      <Field label="Description (supports **bold**, *italic*, ++underline++, # headings)">
        <textarea
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
          rows={4}
          className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
        />
      </Field>

      <Field label="Icon">
        <select
          value={form.icon}
          onChange={(e) => set({ icon: e.target.value })}
          className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
        >
          {iconNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </Field>

      <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
        <input
          type="checkbox"
          checked={form.visible}
          onChange={(e) => set({ visible: e.target.checked })}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Visible on /timeline
      </label>

      <div className="rounded-lg border border-neutral-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Media (optional)</span>
          {hasMedia && (
            <button
              type="button"
              onClick={() => set({ media: null })}
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-rose-600"
            >
              <X className="h-3 w-3" /> Remove
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.gif"
          onChange={handleFileChange}
          className="hidden"
        />

        {hasMedia ? (
          <div className="space-y-2">
            {form.media.url && (
              <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
                <img src={form.media.url} alt="" className="max-h-40 w-full object-contain" />
              </div>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 py-2 text-sm font-medium text-neutral-500 hover:text-amber-700 hover:border-amber-300 disabled:opacity-60"
            >
              <UploadCloud className="h-4 w-4" />
              {uploading ? 'Uploading…' : 'Upload from device'}
            </button>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="URL">
                <input
                  type="text"
                  value={form.media.url ?? ''}
                  onChange={(e) => set({ media: { ...form.media, url: e.target.value } })}
                  placeholder="/images/milestones/example.gif"
                  className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
                />
              </Field>
              <Field label="Type">
                <select
                  value={form.media.type ?? 'image'}
                  onChange={(e) => set({ media: { ...form.media, type: e.target.value } })}
                  className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
                >
                  <option value="image">image</option>
                  <option value="gif">gif</option>
                </select>
              </Field>
              <Field label="Alt text">
                <input
                  type="text"
                  value={form.media.alt ?? ''}
                  onChange={(e) => set({ media: { ...form.media, alt: e.target.value } })}
                  className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
                />
              </Field>
              <Field label="Size">
                <select
                  value={form.media.size ?? 'md'}
                  onChange={(e) => set({ media: { ...form.media, size: e.target.value } })}
                  className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
                >
                  <option value="sm">sm</option>
                  <option value="md">md</option>
                  <option value="lg">lg</option>
                  <option value="full">full</option>
                </select>
              </Field>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 py-2.5 text-sm font-medium text-neutral-500 hover:text-amber-700 hover:border-amber-300 disabled:opacity-60"
            >
              <UploadCloud className="h-4 w-4" />
              {uploading ? 'Uploading…' : 'Upload from device'}
            </button>
            <button
              type="button"
              onClick={() => set({ media: { url: '', type: 'image', alt: '', size: 'md' } })}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 py-2.5 text-sm font-medium text-neutral-500 hover:text-amber-700 hover:border-amber-300"
            >
              <Plus className="h-4 w-4" /> Add media URL
            </button>
          </div>
        )}
      </div>

      <LocationField location={form.location} onChange={(location) => set({ location })} />

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-neutral-200 px-3.5 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function LocationField({ location, onChange }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!searchOpen) return;
    if (!q.trim()) {
      setResults(null);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const r = await api.admin.searchPlaces(q.trim());
        setResults(r);
      } catch (err) {
        setSearchError(err.message);
        setResults(null);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [q, searchOpen]);

  const pick = (place) => {
    onChange({ lat: place.lat, lng: place.lng, label: place.name || place.address });
    setSearchOpen(false);
    setQ('');
    setResults(null);
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Map location (optional)</span>
        <div className="flex items-center gap-2">
          {location && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-rose-600"
            >
              <X className="h-3 w-3" /> Remove
            </button>
          )}
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-amber-700"
          >
            <Search className="h-3 w-3" /> {searchOpen ? 'Close search' : 'Search a place'}
          </button>
        </div>
      </div>

      {location && (
        <div className="mb-2 flex items-center gap-1.5 text-sm text-neutral-700">
          <MapPin className="h-4 w-4 shrink-0 text-rose-500" />
          <span className="truncate">
            {location.label || 'Pinned location'} ({location.lat.toFixed(5)}, {location.lng.toFixed(5)})
          </span>
        </div>
      )}

      {searchOpen && (
        <div className="space-y-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for a place, address, or venue…"
            autoFocus
            className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
          />
          {searching && <p className="text-xs text-neutral-400">Searching…</p>}
          {searchError && <p className="text-xs text-rose-600">{searchError}</p>}
          {results && results.length === 0 && !searching && (
            <p className="text-xs text-neutral-400">No results.</p>
          )}
          {results && results.length > 0 && (
            <ul className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200">
              {results.map((r) => (
                <li key={r.placeId}>
                  <button
                    type="button"
                    onClick={() => pick(r)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-amber-50"
                  >
                    <span className="font-medium text-neutral-800">{r.name}</span>
                    <br />
                    <span className="text-xs text-neutral-500">{r.address}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Latitude">
          <input
            type="number"
            step="any"
            value={location?.lat ?? ''}
            onChange={(e) =>
              onChange({ ...(location ?? { label: null }), lat: parseFloat(e.target.value) || 0, lng: location?.lng ?? 0 })
            }
            className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
          />
        </Field>
        <Field label="Longitude">
          <input
            type="number"
            step="any"
            value={location?.lng ?? ''}
            onChange={(e) =>
              onChange({ ...(location ?? { label: null }), lng: parseFloat(e.target.value) || 0, lat: location?.lat ?? 0 })
            }
            className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
          />
        </Field>
        <Field label="Label">
          <input
            type="text"
            value={location?.label ?? ''}
            onChange={(e) => onChange({ ...(location ?? { lat: 0, lng: 0 }), label: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600">{label}</span>
      {children}
    </label>
  );
}
