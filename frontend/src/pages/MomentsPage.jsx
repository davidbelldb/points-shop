import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function momentDateTime(iso) {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month} ${hours}:${mins}`;
}

function momentFullDate(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

function monthYearKey(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase();
}

function groupByMonth(moments) {
  const groups = new Map();
  for (const m of moments) {
    const k = monthYearKey(m.created_at);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  return [...groups.entries()];
}

function stripHtml(html) {
  return (html ?? '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// AudioPlayer — adapted from MessagesPage
// ---------------------------------------------------------------------------
const WAVEFORM_BARS = Array.from({ length: 28 }, (_, i) =>
  3 + Math.round((Math.abs(Math.sin(i * 1.7)) * 0.7 + Math.abs(Math.sin(i * 0.5)) * 0.3) * 12),
);

function fmtAudio(s) {
  const v = Number.isFinite(s) && s > 0 ? s : 0;
  return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
}

function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [err, setErr] = useState(false);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      document.querySelectorAll('audio').forEach(el => { if (el !== a) el.pause(); });
      setErr(false);
      a.play().catch(() => setErr(true));
    } else { a.pause(); }
  }

  function handleLoadedMetadata(e) {
    const a = e.currentTarget;
    if (Number.isFinite(a.duration) && a.duration > 0) setDur(a.duration);
    else a.currentTime = 1e9;
  }

  function handleSeeked(e) {
    const a = e.currentTarget;
    if (Number.isFinite(a.duration) && a.duration > 0 && dur === 0) {
      setDur(a.duration);
      a.currentTime = 0;
    }
  }

  const progress = dur > 0 ? cur / dur : 0;

  function seek(e) {
    const a = audioRef.current;
    if (!a || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = frac * dur;
    setCur(a.currentTime);
  }

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 min-w-[210px] rounded-xl" style={{ background: 'rgba(97,219,187,0.12)' }}>
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0); }}
        onTimeUpdate={e => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={handleLoadedMetadata}
        onSeeked={handleSeeked}
      />
      <button
        onClick={toggle}
        style={{ background: err ? '#ef4444' : '#61dbbb' }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition active:scale-95"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="4" width="4" height="16" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/>
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-6 cursor-pointer items-center gap-[2px]" onClick={seek}>
          {WAVEFORM_BARS.map((h, i) => (
            <span key={i} className="flex-1 rounded-full" style={{ height: h, background: i / WAVEFORM_BARS.length <= progress ? '#61dbbb' : '#d1faf0' }} />
          ))}
        </div>
        <p className="mt-0.5 text-[10px] font-medium text-neutral-400">
          {dur > 0 ? (cur > 0 ? `${fmtAudio(cur)} / ${fmtAudio(dur)}` : fmtAudio(dur)) : ''}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LocationPicker
// ---------------------------------------------------------------------------
function LocationPicker({ value, onChange, readOnly }) {
  const [query, setQuery] = useState(value ?? '');
  const [results, setResults] = useState([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const searchTimer = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => { setQuery(value ?? ''); }, [value]);

  useEffect(() => {
    const q = query.trim();
    if (!q || q === value) { setResults([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=en`,
          { headers: { 'User-Agent': 'SneakyPoints/1.0' } }
        );
        const data = await r.json();
        setResults(data);
      } catch { setResults([]); }
    }, 400);
    return () => clearTimeout(searchTimer.current);
  }, [query, value]);

  async function detectLocation() {
    setGeoLoading(true);
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 })
      );
      const { latitude: lat, longitude: lon } = pos.coords;
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`,
        { headers: { 'User-Agent': 'SneakyPoints/1.0' } }
      );
      const data = await r.json();
      const addr = data.address ?? {};
      const name = addr.neighbourhood || addr.suburb || addr.city_district || addr.city || addr.town || addr.village || '';
      const short = name || (data.display_name ?? '').split(',').slice(0, 2).join(',').trim();
      setQuery(short);
      onChange(short);
      setResults([]);
    } catch { /* silent fail */ }
    finally { setGeoLoading(false); }
  }

  function selectResult(r) {
    const short = r.display_name.split(',').slice(0, 2).join(',').trim();
    setQuery(short);
    onChange(short);
    setResults([]);
  }

  if (readOnly) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: '#61dbbb' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
        </svg>
        <span className="text-neutral-600 dark:text-neutral-300">{value || 'No location'}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#61dbbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); }}
          onBlur={() => setTimeout(() => setResults([]), 200)}
          placeholder="Where are you?"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
          style={{ color: 'inherit' }}
        />
        <button
          type="button"
          onClick={detectLocation}
          disabled={geoLoading}
          className="shrink-0 rounded p-1 text-neutral-400 transition hover:text-teal-500 disabled:opacity-50"
          aria-label="Detect location"
        >
          {geoLoading ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
            </svg>
          )}
        </button>
      </div>
      {results.length > 0 && (
        <div ref={dropRef} className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl shadow-lg border" style={{ background: '#fff', borderColor: '#e5e5e3' }}>
          {results.map(r => (
            <button
              key={r.place_id}
              onMouseDown={e => e.preventDefault()}
              onClick={() => selectResult(r)}
              className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-neutral-50 transition"
            >
              <span className="truncate">{r.display_name.split(',').slice(0, 3).join(', ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TagsEditor
// ---------------------------------------------------------------------------
const PRESET_TAGS = ['Funny', 'Sweet', 'Us', 'Adventure', 'Proud', 'Grateful', 'Milestone', 'Silly'];

function TagsEditor({ tags, onChange, allTags, readOnly }) {
  const [inputVisible, setInputVisible] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const pool = [...new Set([...PRESET_TAGS, ...allTags])].filter(t => !tags.includes(t));
  const suggestions = tagInput.trim()
    ? pool.filter(t => t.toLowerCase().includes(tagInput.toLowerCase()))
    : pool.slice(0, 8);

  function addTag(tag) {
    const t = tag.trim();
    if (!t || tags.includes(t)) { setTagInput(''); setInputVisible(false); return; }
    onChange([...tags, t]);
    setTagInput('');
    setInputVisible(false);
  }

  function removeTag(tag) { onChange(tags.filter(t => t !== tag)); }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {tags.map(tag => (
        <span key={tag} className="moment-tag">
          {tag}
          {!readOnly && (
            <button onClick={() => removeTag(tag)} className="ml-1 leading-none opacity-60 hover:opacity-100">
              ×
            </button>
          )}
        </span>
      ))}
      {!readOnly && (
        inputVisible ? (
          <div className="relative">
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); }
                if (e.key === 'Escape') { setTagInput(''); setInputVisible(false); }
              }}
              onBlur={() => setTimeout(() => { setTagInput(''); setInputVisible(false); }, 200)}
              placeholder="Add tag..."
              autoFocus
              className="rounded-full border px-2.5 py-0.5 text-xs outline-none"
              style={{ borderColor: '#61dbbb', minWidth: 80, color: 'inherit', background: 'transparent' }}
            />
            {suggestions.length > 0 && (
              <div className="absolute left-0 top-full z-40 mt-1 min-w-[140px] overflow-hidden rounded-xl border shadow-lg" style={{ background: '#fff', borderColor: '#e5e5e3' }}>
                {suggestions.map(s => (
                  <button
                    key={s}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => addTag(s)}
                    className="flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-neutral-50 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setInputVisible(true)}
            className="rounded-full border px-2.5 py-0.5 text-xs transition hover:border-teal-400 hover:text-teal-600"
            style={{ borderColor: '#d1d5db', color: '#9ca3af' }}
          >
            + tag
          </button>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MediaSection
// ---------------------------------------------------------------------------
function MediaSection({ media, momentId, canEdit, onMediaAdded, onMediaRemoved }) {
  const images = media.filter(m => m.type === 'image');
  const voices = media.filter(m => m.type === 'voice');

  const photoInputRef = useRef(null);
  const recorderRef   = useRef(null);
  const recChunksRef  = useRef([]);
  const recMimeRef    = useRef('');
  const recTimerRef   = useRef(null);

  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs]     = useState(0);
  const [recBlob, setRecBlob]     = useState(null);
  const [recBlobUrl, setRecBlobUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox]   = useState(null);

  async function addPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const { url } = await api.upload(file);
      const med = await api.addMomentMedia(momentId, url, 'image');
      onMediaAdded(med);
    } catch { /* silent */ }
    finally { setUploading(false); }
  }

  async function toggleRecording() {
    if (recording) {
      clearInterval(recTimerRef.current);
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      recMimeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      recChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) recChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recTimerRef.current);
        setRecording(false);
        const blob = new Blob(recChunksRef.current, { type: mimeType });
        setRecBlob(blob);
        setRecBlobUrl(URL.createObjectURL(blob));
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecSecs(0);
      setRecording(true);
      recTimerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);
    } catch { /* mic denied */ }
  }

  async function confirmVoice() {
    if (!recBlob) return;
    const blob = recBlob;
    const blobUrl = recBlobUrl;
    setRecBlob(null); setRecBlobUrl(null); setRecSecs(0);
    URL.revokeObjectURL(blobUrl);
    setUploading(true);
    try {
      const mimeType = recMimeRef.current;
      const ext = mimeType.includes('webm') ? 'webm' : 'm4a';
      const file = new File([blob], `voice-note.${ext}`, { type: mimeType });
      const { url } = await api.upload(file);
      const med = await api.addMomentMedia(momentId, url, 'voice');
      onMediaAdded(med);
    } catch { /* silent */ }
    finally { setUploading(false); }
  }

  function discardVoice() {
    if (recBlobUrl) URL.revokeObjectURL(recBlobUrl);
    setRecBlob(null); setRecBlobUrl(null); setRecSecs(0);
  }

  return (
    <div className="space-y-3">
      {/* Image grid */}
      {images.length > 0 && (
        <div className={`grid gap-1 ${images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {images.map(img => (
            <div key={img.id} className="relative aspect-square overflow-hidden rounded-xl">
              <img
                src={img.url}
                alt=""
                className="h-full w-full object-cover cursor-pointer"
                onClick={() => setLightbox(img.url)}
              />
              {canEdit && (
                <button
                  onClick={() => onMediaRemoved(img.id)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Voice notes */}
      {voices.map(v => (
        <div key={v.id} className="flex items-center gap-2">
          <div className="flex-1">
            <AudioPlayer src={v.url} />
          </div>
          {canEdit && (
            <button
              onClick={() => onMediaRemoved(v.id)}
              className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold"
              style={{ background: '#fca5a5', color: '#3a1818' }}
            >
              ×
            </button>
          )}
        </div>
      ))}

      {/* Recording preview */}
      {recBlobUrl && (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <AudioPlayer src={recBlobUrl} />
          </div>
          <button onClick={confirmVoice} disabled={uploading} className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: '#61dbbb', color: '#0a2a23' }}>
            {uploading ? '...' : 'Add'}
          </button>
          <button onClick={discardVoice} className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: '#fca5a5', color: '#3a1818' }}>
            Discard
          </button>
        </div>
      )}

      {/* Add media controls */}
      {canEdit && !recBlobUrl && (
        <div className="flex items-center gap-2">
          {recording && (
            <span className="text-xs font-medium text-red-500 animate-pulse mr-1">
              {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, '0')}
            </span>
          )}
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploading}
            className="flex h-8 w-8 items-center justify-center rounded-full border transition hover:border-teal-400 hover:text-teal-600 disabled:opacity-40"
            style={{ borderColor: '#d1d5db', color: '#9ca3af' }}
            aria-label="Add photo"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={toggleRecording}
            className={`flex h-8 w-8 items-center justify-center rounded-full border transition active:scale-95 ${recording ? 'border-red-300 bg-red-50 text-red-500 animate-pulse' : 'hover:border-teal-400 hover:text-teal-600'}`}
            style={recording ? {} : { borderColor: '#d1d5db', color: '#9ca3af' }}
            aria-label={recording ? 'Stop recording' : 'Record voice note'}
          >
            {recording ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
                <line x1="8" y1="22" x2="16" y2="22"/>
              </svg>
            )}
          </button>
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={addPhoto} />
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full text-white text-xl" style={{ background: 'rgba(0,0,0,0.5)' }}>×</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiptap toolbar (reused from notes pattern)
// ---------------------------------------------------------------------------
function MomentToolbar({ editor }) {
  if (!editor) return null;

  function tb(label, onClick, active) {
    return (
      <button
        type="button"
        aria-label={label}
        onMouseDown={e => { e.preventDefault(); onClick(); }}
        className={`notes-tb-btn ${active ? 'active' : ''}`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="notes-toolbar flex flex-wrap items-center gap-1 px-3 py-2">
      {tb('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
      {tb('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
      {tb('U', () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'))}
      {tb('S', () => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'))}
      <button
        type="button"
        aria-label="Highlight"
        onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleHighlight().run(); }}
        className={`notes-tb-btn ${editor.isActive('highlight') ? 'active' : ''}`}
        style={{ fontSize: 12 }}
      >
        H
      </button>
      <div className="mx-1 h-4 w-px" style={{ background: '#e5e5e3' }} />
      {tb('•', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
      {tb('1.', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
      <button
        type="button"
        aria-label="Task list"
        onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleTaskList().run(); }}
        className={`notes-tb-btn ${editor.isActive('taskList') ? 'active' : ''}`}
        style={{ fontSize: 12 }}
      >
        ☑
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MomentEditor — own moments (editable)
// ---------------------------------------------------------------------------
function MomentEditor({ moment, partnerName, onUpdate, onPromote, onDelete }) {
  const [location, setLocation] = useState(moment.location ?? '');
  const [tags, setTags]         = useState(moment.tags ?? []);
  const [media, setMedia]       = useState(moment.media ?? []);
  const [saving, setSaving]     = useState(false);
  const [savedAt, setSavedAt]   = useState(null);

  const saveTimer  = useRef(null);
  const latestBody = useRef(moment.body ?? '');
  const latestLoc  = useRef(moment.location ?? '');
  const latestTags = useRef(moment.tags ?? []);
  const onUpdateRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Underline,
      Placeholder.configure({ placeholder: 'What are you thinking?' }),
    ],
    content: moment.body || '',
    onUpdate: ({ editor: ed }) => onUpdateRef.current?.(ed),
  });

  onUpdateRef.current = (ed) => {
    latestBody.current = ed.getHTML();
    scheduleSave();
  };

  function scheduleSave() {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, 800);
  }

  async function doSave() {
    setSaving(true);
    try {
      const updated = await api.updateMoment(moment.id, {
        location: latestLoc.current,
        body: latestBody.current,
        tags: latestTags.current,
      });
      setSavedAt(new Date());
      onUpdate?.(updated);
    } catch { /* silent */ }
    finally { setSaving(false); }
  }

  function handleLocationChange(loc) {
    setLocation(loc);
    latestLoc.current = loc;
    scheduleSave();
  }

  function handleTagsChange(newTags) {
    setTags(newTags);
    latestTags.current = newTags;
    scheduleSave();
  }

  async function handlePromote() {
    try {
      const updated = await api.promoteMoment(moment.id);
      onPromote?.(updated);
    } catch { /* silent */ }
  }

  async function handleDelete() {
    if (!confirm('Delete this moment?')) return;
    try { await api.deleteMoment(moment.id); onDelete?.(moment.id); }
    catch { /* silent */ }
  }

  function handleMediaAdded(med) { setMedia(prev => [...prev, med]); }
  async function handleMediaRemoved(mediaId) {
    try {
      await api.removeMomentMedia(moment.id, mediaId);
      setMedia(prev => prev.filter(m => m.id !== mediaId));
    } catch { /* silent */ }
  }

  // Cleanup on unmount
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // Reset when moment changes
  useEffect(() => {
    setLocation(moment.location ?? '');
    setTags(moment.tags ?? []);
    setMedia(moment.media ?? []);
    latestLoc.current  = moment.location ?? '';
    latestTags.current = moment.tags ?? [];
    latestBody.current = moment.body ?? '';
    if (editor && !editor.isDestroyed) {
      editor.commands.setContent(moment.body || '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment.id]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex-1 px-4 py-5 space-y-4">
        {/* Date + status row */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium" style={{ color: '#61dbbb' }}>
            {momentFullDate(moment.created_at)}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {saving ? (
              <span className="text-xs text-neutral-400">Saving...</span>
            ) : savedAt ? (
              <span className="text-xs text-neutral-400">Saved</span>
            ) : null}
            {moment.type === 'personal' && (
              <button
                onClick={handlePromote}
                className="rounded-full px-2.5 py-0.5 text-xs font-medium transition hover:opacity-80"
                style={{ background: 'rgba(97,219,187,0.15)', color: '#61dbbb' }}
              >
                Share with {partnerName}
              </button>
            )}
            {moment.type === 'shared' && (
              <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: 'rgba(97,219,187,0.15)', color: '#61dbbb' }}>
                Shared
              </span>
            )}
          </div>
        </div>

        {/* Location */}
        <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: '#e5e5e3' }}>
          <LocationPicker value={location} onChange={handleLocationChange} />
        </div>

        {/* Body — Tiptap */}
        <div className="notes-content min-h-[120px]">
          <EditorContent editor={editor} />
        </div>

        {/* Media */}
        <MediaSection
          media={media}
          momentId={moment.id}
          canEdit={true}
          onMediaAdded={handleMediaAdded}
          onMediaRemoved={handleMediaRemoved}
        />

        {/* Tags */}
        <div className="pt-1">
          <TagsEditor tags={tags} onChange={handleTagsChange} allTags={[]} />
        </div>

        {/* Delete */}
        <div className="pt-2 pb-4">
          <button
            onClick={handleDelete}
            className="text-xs font-medium transition hover:opacity-80"
            style={{ color: '#fca5a5' }}
          >
            Delete moment
          </button>
        </div>
      </div>

      {/* Tiptap toolbar pinned at bottom */}
      <MomentToolbar editor={editor} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MomentViewer — partner's shared moments (read-only)
// ---------------------------------------------------------------------------
function MomentViewer({ moment }) {
  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-5 space-y-4">
      {/* Date + author */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium" style={{ color: '#61dbbb' }}>
          {momentFullDate(moment.created_at)}
        </p>
        <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: 'rgba(97,219,187,0.12)', color: '#61dbbb' }}>
          {moment.account_name}
        </span>
      </div>

      {/* Location */}
      {moment.location && (
        <LocationPicker value={moment.location} readOnly />
      )}

      {/* Body */}
      {moment.body ? (
        <div className="notes-content-ro" dangerouslySetInnerHTML={{ __html: moment.body }} />
      ) : (
        <p className="text-sm text-neutral-400 italic">No thoughts shared.</p>
      )}

      {/* Media */}
      {(moment.media ?? []).length > 0 && (
        <MediaSection
          media={moment.media}
          momentId={moment.id}
          canEdit={false}
          onMediaAdded={() => {}}
          onMediaRemoved={() => {}}
        />
      )}

      {/* Tags */}
      {(moment.tags ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {moment.tags.map(tag => (
            <span key={tag} className="moment-tag">{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SwipeRow — swipe left to delete (own moments only)
// ---------------------------------------------------------------------------
const SWIPE_TRIGGER = 70;
const SWIPE_MAX     = 90;

function SwipeRow({ children, onDelete, canDelete }) {
  const ref    = useRef(null);
  const state  = useRef(null);
  const [dragX, setDragX]   = useState(0);
  const [armed, setArmed]   = useState(false);

  function onPointerDown(e) {
    if (!canDelete) return;
    state.current = { startX: e.clientX, startY: e.clientY, tracking: true, decided: false, suppressClick: false, pointerId: e.pointerId };
  }

  function onPointerMove(e) {
    const s = state.current;
    if (!s?.tracking) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.decided) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) { s.tracking = false; return; }
      if (dx > 0) { s.tracking = false; return; } // only left swipe
      s.decided = true;
      try { e.currentTarget.setPointerCapture?.(s.pointerId); } catch {}
    }
    const clamped = Math.max(-SWIPE_MAX, Math.min(0, dx));
    setDragX(clamped);
    setArmed(clamped <= -SWIPE_TRIGGER);
  }

  function onPointerUp() {
    const s = state.current;
    if (!s) return;
    if (s.decided && armed) {
      s.suppressClick = true;
      onDelete?.();
    }
    setDragX(0); setArmed(false);
    if (s) { s.tracking = false; s.decided = false; }
  }

  return (
    <div
      className="relative overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ touchAction: 'pan-y' }}
    >
      {/* Delete reveal */}
      {canDelete && (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-end px-4 transition-opacity"
          style={{ opacity: Math.min(1, Math.abs(dragX) / SWIPE_TRIGGER), background: '#fca5a5' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3a1818" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </div>
      )}
      <div
        style={{
          transform: dragX ? `translateX(${dragX}px)` : undefined,
          transition: dragX ? 'none' : 'transform 0.22s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function MomentsPage() {
  const { user } = useAuth();

  const [moments, setMoments]           = useState([]);
  const [selected, setSelected]         = useState(null);
  const [mobileView, setMobileView]     = useState('list'); // 'list' | 'detail'
  const [loading, setLoading]           = useState(true);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [creating, setCreating]         = useState(false);
  const [activeTag, setActiveTag]       = useState(null);

  // Infer partner name from currently-logged-in user
  const userName    = user?.name ?? '';
  const partnerName = userName.toLowerCase() === 'david' ? 'Katie' : 'David';

  async function load() {
    try {
      const data = await api.listMoments();
      setMoments(data);
      // Keep selection in sync if the moment was updated externally
      if (selected) {
        const fresh = data.find(m => m.id === selected.id);
        if (fresh) setSelected(fresh);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // All distinct tags across visible moments
  const allTags = [...new Set(moments.flatMap(m => m.tags ?? []))];

  // Filtered moments
  const filtered = activeTag
    ? moments.filter(m => (m.tags ?? []).includes(activeTag))
    : moments;

  // Determine if a moment is mine
  function isMine(m) { return m.account_id === user?.id; }

  function selectMoment(m) {
    setSelected(m);
    setMobileView('detail');
  }

  function handleBack() {
    setMobileView('list');
    setSelected(null);
  }

  async function createMoment(type) {
    setShowTypePicker(false);
    setCreating(true);
    try {
      const newM = await api.createMoment(type);
      setMoments(prev => [newM, ...prev]);
      setSelected(newM);
      setMobileView('detail');
    } catch { /* silent */ }
    finally { setCreating(false); }
  }

  function handleUpdate(updated) {
    setMoments(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
    if (selected?.id === updated.id) setSelected(prev => ({ ...prev, ...updated }));
  }

  function handlePromote(updated) {
    handleUpdate(updated);
  }

  function handleDelete(id) {
    setMoments(prev => prev.filter(m => m.id !== id));
    setSelected(null);
    setMobileView('list');
  }

  // Group filtered moments by month-year
  const groups = groupByMonth(filtered);

  // Preview text for list
  function previewText(m) {
    const loc = m.location || '';
    const body = stripHtml(m.body || '').slice(0, 60);
    return loc || body || 'New moment';
  }

  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;

  return (
    <div className="moments-page flex h-[calc(100dvh-56px)] overflow-hidden">
      {/* ── List panel ── */}
      <div
        className={`moments-list-panel flex flex-col ${
          mobileView === 'detail' ? 'hidden md:flex' : 'flex'
        } w-full md:w-72 md:flex-shrink-0 border-r`}
        style={{ borderColor: '#e5e5e3' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#e5e5e3' }}>
          <h1 className="text-base font-semibold">Sneaky Moments</h1>
          <div className="relative">
            <button
              onClick={() => setShowTypePicker(p => !p)}
              disabled={creating}
              className="flex h-7 w-7 items-center justify-center rounded-full transition hover:opacity-80 disabled:opacity-40"
              style={{ background: '#61dbbb', color: '#0a2a23' }}
              aria-label="New moment"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            {showTypePicker && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowTypePicker(false)} />
                <div className="absolute right-0 top-full z-40 mt-2 w-52 overflow-hidden rounded-2xl border shadow-xl" style={{ background: '#fff', borderColor: '#e5e5e3' }}>
                  <button
                    onClick={() => createMoment('personal')}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-sm hover:bg-neutral-50 transition text-left"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#61dbbb" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>
                    </svg>
                    Just for me
                  </button>
                  <button
                    onClick={() => createMoment('shared')}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-sm hover:bg-neutral-50 transition text-left"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#61dbbb" strokeWidth="2" strokeLinecap="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    Shared with {partnerName}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tag filters */}
        {allTags.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto px-3 py-2 scrollbar-none border-b" style={{ borderColor: '#e5e5e3' }}>
            <button
              onClick={() => setActiveTag(null)}
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition ${!activeTag ? 'text-white' : 'text-neutral-500 hover:text-neutral-700'}`}
              style={!activeTag ? { background: '#61dbbb', color: '#0a2a23' } : {}}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition ${activeTag === tag ? 'text-white' : 'text-neutral-500 hover:text-neutral-700'}`}
                style={activeTag === tag ? { background: '#61dbbb', color: '#0a2a23' } : {}}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Moment list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-neutral-400">Loading...</div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <p className="text-sm text-neutral-400">No moments yet.</p>
              <p className="mt-1 text-xs text-neutral-300">Tap + to capture your first moment.</p>
            </div>
          ) : (
            groups.map(([month, items]) => (
              <div key={month}>
                <div className="px-4 py-1.5 text-[10px] font-semibold tracking-widest" style={{ color: '#9ca3af' }}>
                  {month}
                </div>
                {items.map(m => (
                  <SwipeRow
                    key={m.id}
                    canDelete={isMine(m)}
                    onDelete={() => {
                      if (!confirm('Delete this moment?')) return;
                      api.deleteMoment(m.id).then(() => handleDelete(m.id)).catch(() => {});
                    }}
                  >
                    <button
                      onClick={() => selectMoment(m)}
                      className={`w-full px-4 py-2.5 text-left transition hover:bg-neutral-50 ${selected?.id === m.id ? 'bg-neutral-100' : ''}`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {previewText(m)}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums" style={{ color: '#9ca3af' }}>
                          {momentDateTime(m.created_at)}
                        </span>
                      </div>
                      {(m.tags ?? []).length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {m.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="moment-tag-tiny">{tag}</span>
                          ))}
                        </div>
                      )}
                      {!isMine(m) && (
                        <p className="mt-0.5 text-[10px]" style={{ color: '#61dbbb' }}>
                          {m.account_name}
                        </p>
                      )}
                    </button>
                  </SwipeRow>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Detail panel ── */}
      <div
        className={`flex-1 flex flex-col min-w-0 ${
          mobileView === 'list' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {selected ? (
          <>
            {/* Mobile back header */}
            <div className="md:hidden flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: '#e5e5e3' }}>
              <button onClick={handleBack} className="flex items-center gap-1 text-sm transition hover:opacity-70" style={{ color: '#61dbbb' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
                Moments
              </button>
            </div>

            {/* Editor or viewer */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {isMine(selected) ? (
                <MomentEditor
                  key={selected.id}
                  moment={selected}
                  partnerName={partnerName}
                  onUpdate={handleUpdate}
                  onPromote={handlePromote}
                  onDelete={handleDelete}
                />
              ) : (
                <MomentViewer moment={selected} />
              )}
            </div>
          </>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center">
            <p className="text-sm text-neutral-400">Select a moment to view it</p>
          </div>
        )}
      </div>
    </div>
  );
}
