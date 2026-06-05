import { useState, useRef, useEffect } from 'react';
import StickerContent from './StickerContent.jsx';

/* Shared bottom-sheet config for the two "pill" sticker types:
   - Location: typed place name + GPS snap + Nominatim search autocomplete.
   - Now Playing: manual song/artist + Last.fm "fetch current track" strip. */

const COLORS = ['#ffffff', '#000000', '#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#14b8a6'];

const PRESETS = {
  location: {
    title: 'Location',
    empty: { type: 'location', text: '', color: '#111827', bgColor: '#ffffff', rot: 0, x: 50, y: 45 },
  },
  playing: {
    title: 'Now playing',
    empty: { type: 'playing', title: '', artist: '', color: '#ffffff', bgColor: '#000000', rot: 0, x: 50, y: 45 },
  },
};

/* ─── Icons ──────────────────────────────────────────────────────────────── */

function GPSIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
    </svg>
  );
}

function SpinnerIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

// Last.fm's recognisable red scrobble-wave mark, simplified.
function LastfmIcon() {
  return (
    <svg width="20" height="14" viewBox="0 0 40 28" fill="#d51007">
      <path d="M18 22.5 13.5 11.5 11 20.5 7 16 2 28h8l1-3 4 3 6-16.5L24 28h8L26.5 11 22 22.5z" />
      <path d="M32 6c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6-6-2.7-6-6z" />
    </svg>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */

export default function PillStickerConfig({ kind, initial, onCancel, onSave, onDelete }) {
  const preset = PRESETS[kind] ?? PRESETS.location;
  const [draft, setDraft] = useState(() => ({ ...preset.empty, ...(initial ?? {}) }));
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  /* ── Location search state ──────────────────────────────────────── */
  const [locationResults, setLocationResults] = useState([]);
  const [locationSearching, setLocationSearching] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef(null);

  /* ── Last.fm song search state ─────────────────────────────────── */
  const [songQuery, setSongQuery] = useState('');
  const [songResults, setSongResults] = useState([]);
  const [songSearching, setSongSearching] = useState(false);
  const [showSongDropdown, setShowSongDropdown] = useState(false);
  const songDebounceRef = useRef(null);

  /* ── Location handlers ──────────────────────────────────────────── */

  async function searchNominatim(query) {
    if (!query.trim()) { setLocationResults([]); setShowDropdown(false); return; }
    setLocationSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      setLocationResults(data);
      setShowDropdown(data.length > 0);
    } catch {
      setLocationResults([]);
      setShowDropdown(false);
    } finally {
      setLocationSearching(false);
    }
  }

  function handleLocationInput(e) {
    const value = e.target.value;
    set({ text: value });
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchNominatim(value), 400);
  }

  function pickResult(result) {
    const addr = result.address ?? {};
    const name = result.name || addr.amenity || addr.road || '';
    const locality = addr.city || addr.town || addr.village || addr.suburb || '';
    const text = [name, locality].filter(Boolean).join(', ')
      || result.display_name?.split(',')[0]
      || result.display_name;
    set({ text });
    setLocationResults([]);
    setShowDropdown(false);
  }

  async function useGPS() {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      const { latitude, longitude } = pos.coords;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      const addr = data.address ?? {};
      const name = data.name || addr.amenity || addr.road || '';
      const locality = addr.city || addr.town || addr.village || addr.suburb || '';
      const text = [name, locality].filter(Boolean).join(', ')
        || data.display_name?.split(',')[0]
        || 'Here';
      set({ text });
      setLocationResults([]);
      setShowDropdown(false);
    } catch {
      // GPS denied or timed out — silently ignore.
    } finally {
      setGpsLoading(false);
    }
  }

  /* ── Last.fm song search handlers ──────────────────────────────── */

  function handleSongQueryChange(e) {
    const val = e.target.value;
    setSongQuery(val);
    clearTimeout(songDebounceRef.current);
    if (!val.trim()) { setSongResults([]); setShowSongDropdown(false); return; }
    songDebounceRef.current = setTimeout(async () => {
      setSongSearching(true);
      try {
        const res = await fetch(
          `/api/lastfm/search?q=${encodeURIComponent(val.trim())}`,
          { credentials: 'include' }
        );
        const data = await res.json();
        if (Array.isArray(data)) {
          setSongResults(data);
          setShowSongDropdown(data.length > 0);
        }
      } catch {
        setSongResults([]);
        setShowSongDropdown(false);
      } finally {
        setSongSearching(false);
      }
    }, 400);
  }

  function pickSongResult(track) {
    set({ title: track.title, artist: track.artist });
    setSongQuery('');
    setSongResults([]);
    setShowSongDropdown(false);
  }

  const canSave = kind === 'location' ? !!draft.text?.trim() : !!draft.title?.trim();

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <button onClick={onCancel} className="text-sm text-neutral-500">Cancel</button>
          <span className="text-sm font-semibold">{preset.title} sticker</span>
          <button
            onClick={() => onSave(draft)}
            disabled={!canSave}
            className="text-sm font-semibold text-amber-700 disabled:opacity-40"
          >
            Save
          </button>
        </header>

        <div className="max-h-[72vh] space-y-4 overflow-y-auto p-4">
          {/* Live preview */}
          <div className="flex min-h-[80px] items-center justify-center rounded-2xl bg-gradient-to-br from-neutral-700 to-neutral-900 p-4">
            <StickerContent sticker={draft} />
          </div>

          {/* ── Location fields ── */}
          {kind === 'location' ? (
            <div>
              <label className="text-xs font-semibold text-neutral-500">Place</label>
              <div className="relative mt-1">
                <div className="flex gap-2">
                  <input
                    value={draft.text}
                    onChange={handleLocationInput}
                    onFocus={() => locationResults.length > 0 && setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    maxLength={60}
                    autoFocus
                    placeholder="e.g. City Kebab"
                    className="flex-1 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={useGPS}
                    disabled={gpsLoading}
                    title="Snap to my location"
                    className="flex items-center justify-center rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-neutral-500 transition hover:bg-amber-50 active:scale-95 disabled:opacity-40"
                  >
                    {gpsLoading ? <SpinnerIcon /> : <GPSIcon />}
                  </button>
                </div>

                {/* Autocomplete dropdown */}
                {showDropdown && locationResults.length > 0 && (
                  <ul className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
                    {locationResults.map((r, i) => {
                      const primary = r.name || r.display_name?.split(',')[0] || '';
                      const secondary = r.display_name?.split(',').slice(1, 3).join(',').trim() || '';
                      return (
                        <li key={i}>
                          <button
                            type="button"
                            onMouseDown={() => pickResult(r)}
                            className="flex w-full flex-col px-3 py-2 text-left hover:bg-amber-50"
                          >
                            <span className="text-sm font-medium text-neutral-800">{primary}</span>
                            {secondary && (
                              <span className="text-xs text-neutral-400">{secondary}</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            /* ── Now Playing fields ── */
            <>
              {/* Last.fm song search */}
              <div>
                <label className="text-xs font-semibold text-neutral-500">Search for a song</label>
                <div className="relative mt-1">
                  <div className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 focus-within:border-amber-500">
                    <LastfmIcon />
                    <input
                      value={songQuery}
                      onChange={handleSongQueryChange}
                      onFocus={() => songResults.length > 0 && setShowSongDropdown(true)}
                      onBlur={() => setTimeout(() => setShowSongDropdown(false), 150)}
                      placeholder="Class Historian…"
                      className="flex-1 text-sm outline-none bg-transparent"
                    />
                    {songSearching && <SpinnerIcon size={14} />}
                  </div>
                  {showSongDropdown && songResults.length > 0 && (
                    <ul className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
                      {songResults.map((t, i) => (
                        <li key={i}>
                          <button
                            type="button"
                            onMouseDown={() => pickSongResult(t)}
                            className="flex w-full flex-col px-3 py-2 text-left hover:bg-amber-50"
                          >
                            <span className="text-sm font-medium text-neutral-800">{t.title}</span>
                            <span className="text-xs text-neutral-400">{t.artist}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Manual song + artist */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-neutral-500">Song</label>
                  <input
                    value={draft.title}
                    onChange={(e) => set({ title: e.target.value })}
                    maxLength={50}
                    placeholder="Class Historian"
                    className="mt-1 block w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-neutral-500">Artist</label>
                  <input
                    value={draft.artist}
                    onChange={(e) => set({ artist: e.target.value })}
                    maxLength={50}
                    placeholder="BRONCHO"
                    className="mt-1 block w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          {/* Colour pickers — shared by both kinds */}
          <div>
            <label className="text-xs font-semibold text-neutral-500">Text colour</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set({ color: c })}
                  aria-label={`Text ${c}`}
                  className={`h-8 w-8 rounded-full border transition ${draft.color === c ? 'ring-2 ring-amber-500 ring-offset-2' : 'border-neutral-300'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-500">Pill colour</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set({ bgColor: c })}
                  aria-label={`Pill ${c}`}
                  className={`h-8 w-8 rounded-full border transition ${draft.bgColor === c ? 'ring-2 ring-amber-500 ring-offset-2' : 'border-neutral-300'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="mt-2 w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
            >
              Remove sticker
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
