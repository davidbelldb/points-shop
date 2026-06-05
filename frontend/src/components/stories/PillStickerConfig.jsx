import { useState, useRef, useEffect } from 'react';
import StickerContent from './StickerContent.jsx';

/* Shared bottom-sheet config for the two "pill" sticker types:
   - Location: typed place name + GPS snap + Nominatim search autocomplete.
   - Now Playing: manual song/artist + optional Spotify "fetch current track" strip. */

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

function SpotifyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="12" fill="#1DB954" />
      <path d="M17.9 10.9C14.7 9 9.35 8.8 6.3 9.75c-.5.15-1-.15-1.15-.6-.15-.5.15-1 .6-1.15 3.55-1.05 9.4-.85 13.1 1.35.45.25.6.85.35 1.3-.25.35-.85.5-1.3.25zm-.1 2.8c-.25.35-.7.5-1.05.25-2.7-1.65-6.8-2.15-9.95-1.15-.4.1-.85-.1-.95-.5-.1-.4.1-.85.5-.95 3.65-1.1 8.15-.55 11.25 1.35.3.15.45.65.2 1zm-1.2 2.75c-.2.3-.55.4-.85.2-2.35-1.45-5.3-1.75-8.8-.95-.35.1-.65-.15-.75-.45-.1-.35.15-.65.45-.75 3.8-.85 7.1-.5 9.7 1.1.35.15.4.55.25.85z" fill="white" />
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

  /* ── Spotify state ──────────────────────────────────────────────── */
  // null = still checking, false = not connected, true = connected
  const [spotifyStatus, setSpotifyStatus] = useState(null);
  const [spotifyFetching, setSpotifyFetching] = useState(false);
  const [spotifyMsg, setSpotifyMsg] = useState(null);

  // Check connection status on mount (playing kind only).
  useEffect(() => {
    if (kind !== 'playing') return;
    fetch('/api/spotify/status', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setSpotifyStatus(!!d.connected))
      .catch(() => setSpotifyStatus(false));
  }, [kind]);

  // Listen for the postMessage from the OAuth popup window.
  useEffect(() => {
    if (kind !== 'playing') return;
    function onMessage(e) {
      if (e.data?.type === 'spotify_connected') {
        setSpotifyStatus(true);
        setSpotifyMsg(null);
      } else if (e.data?.type === 'spotify_error') {
        setSpotifyMsg('Spotify authorisation failed — please try again.');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [kind]);

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

  /* ── Spotify handlers ───────────────────────────────────────────── */

  function connectSpotify() {
    window.open('/api/spotify/auth', 'spotify_auth', 'width=500,height=720,left=200,top=100');
  }

  async function fetchNowPlaying() {
    setSpotifyFetching(true);
    setSpotifyMsg(null);
    try {
      const res = await fetch('/api/spotify/now-playing', { credentials: 'include' });
      const data = await res.json();
      if (data.playing && data.title) {
        set({ title: data.title, artist: data.artist ?? '' });
      } else {
        setSpotifyMsg('Nothing playing right now.');
      }
    } catch {
      setSpotifyMsg('Could not reach Spotify.');
    } finally {
      setSpotifyFetching(false);
    }
  }

  async function disconnectSpotify() {
    await fetch('/api/spotify/disconnect', { method: 'DELETE', credentials: 'include' }).catch(() => {});
    setSpotifyStatus(false);
    setSpotifyMsg(null);
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
              {/* Spotify connect/fetch strip */}
              <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                <SpotifyIcon />
                {spotifyStatus === null ? (
                  <span className="flex-1 text-xs text-neutral-400">Checking Spotify…</span>
                ) : spotifyStatus ? (
                  <>
                    <span className="flex-1 text-xs text-neutral-600">Spotify connected</span>
                    <button
                      type="button"
                      onClick={fetchNowPlaying}
                      disabled={spotifyFetching}
                      className="flex items-center gap-1 text-xs font-semibold text-green-700 disabled:opacity-50"
                    >
                      {spotifyFetching && <SpinnerIcon size={12} />}
                      {spotifyFetching ? 'Fetching…' : 'Fetch playing'}
                    </button>
                    <button
                      type="button"
                      onClick={disconnectSpotify}
                      title="Disconnect Spotify"
                      className="ml-1 text-base leading-none text-neutral-300 hover:text-red-400"
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-xs text-neutral-600">Auto-fill from Spotify</span>
                    <button
                      type="button"
                      onClick={connectSpotify}
                      className="text-xs font-semibold text-green-700"
                    >
                      Connect
                    </button>
                  </>
                )}
              </div>

              {spotifyMsg && (
                <p className="text-xs text-neutral-500">{spotifyMsg}</p>
              )}

              {/* Manual song + artist */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-neutral-500">Song</label>
                  <input
                    value={draft.title}
                    onChange={(e) => set({ title: e.target.value })}
                    maxLength={50}
                    autoFocus
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
