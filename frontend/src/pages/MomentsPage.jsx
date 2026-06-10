/**
 * Sneaky Moments — private moment-capturing feature.
 *
 * Layout:
 *   Mobile  : single-pane toggle  (list → editor with back button)
 *   Desktop : persistent two-pane (280 px list | full editor/viewer)
 *
 * Rules:
 *   - Own moments (personal or shared) are fully editable.
 *   - Partner's shared moments are read-only.
 *   - Personal moments can be promoted to shared at any time.
 *   - Partner name comes from API, never hardcoded.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function momentShortDt(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function momentFullDt(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function monthKey(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase();
}

function groupByMonth(moments) {
  const map = new Map();
  for (const m of moments) {
    const k = monthKey(m.created_at);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(m);
  }
  return [...map.entries()];
}

function stripHtml(html) {
  return (html ?? '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return 'Just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const BackChevron = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const PersonIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);
const SharedIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const PinIcon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const TrashIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);

// ─── AudioPlayer ──────────────────────────────────────────────────────────────

const WAVEFORM = Array.from({ length: 28 }, (_, i) =>
  3 + Math.round((Math.abs(Math.sin(i * 1.7)) * 0.7 + Math.abs(Math.sin(i * 0.5)) * 0.3) * 12),
);
function fmtT(s) { const v = Number.isFinite(s) && s > 0 ? s : 0; return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`; }

function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  function toggle() {
    const a = audioRef.current; if (!a) return;
    if (a.paused) { document.querySelectorAll('audio').forEach(x => { if (x !== a) x.pause(); }); a.play().catch(() => {}); }
    else a.pause();
  }
  function onMeta(e) { const a = e.currentTarget; if (Number.isFinite(a.duration) && a.duration > 0) setDur(a.duration); else a.currentTime = 1e9; }
  function onSeeked(e) { const a = e.currentTarget; if (Number.isFinite(a.duration) && a.duration > 0 && dur === 0) { setDur(a.duration); a.currentTime = 0; } }
  function seek(e) { const a = audioRef.current; if (!a || !dur) return; const r = e.currentTarget.getBoundingClientRect(); a.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * dur; }
  const pct = dur > 0 ? cur / dur : 0;

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 min-w-[200px] rounded-xl bg-[#61dbbb]/10 dark:bg-[#61dbbb]/15">
      <audio ref={audioRef} src={src} preload="auto"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0); }}
        onTimeUpdate={e => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={onMeta} onSeeked={onSeeked}
      />
      <button onClick={toggle} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white active:scale-95" style={{ background: '#61dbbb' }}>
        {playing
          ? <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4" height="16" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/></svg>
          : <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        }
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-6 cursor-pointer items-center gap-[2px]" onClick={seek}>
          {WAVEFORM.map((h, i) => (
            <span key={i} className="flex-1 rounded-full" style={{ height: h, background: i / WAVEFORM.length <= pct ? '#61dbbb' : '#d1faf0' }} />
          ))}
        </div>
        {dur > 0 && <p className="mt-0.5 text-[10px] text-neutral-400">{cur > 0 ? `${fmtT(cur)} / ${fmtT(dur)}` : fmtT(dur)}</p>}
      </div>
    </div>
  );
}

// ─── LocationPicker ───────────────────────────────────────────────────────────

function LocationPicker({ value, onChange, readOnly }) {
  const [query, setQuery]     = useState(value ?? '');
  const [results, setResults] = useState([]);
  const [geoLoad, setGeoLoad] = useState(false);
  const timer = useRef(null);

  useEffect(() => { setQuery(value ?? ''); }, [value]);

  useEffect(() => {
    const q = query.trim();
    if (!q || q === value) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=en`, { headers: { 'User-Agent': 'SneakyPoints/1.0' } });
        setResults(await r.json());
      } catch { setResults([]); }
    }, 420);
    return () => clearTimeout(timer.current);
  }, [query, value]);

  async function detect() {
    setGeoLoad(true);
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 }));
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=en`, { headers: { 'User-Agent': 'SneakyPoints/1.0' } });
      const d = await r.json();
      const addr = d.address ?? {};
      const name = addr.neighbourhood || addr.suburb || addr.city_district || addr.city || addr.town || addr.village || d.display_name?.split(',').slice(0, 2).join(',').trim() || '';
      setQuery(name); onChange(name); setResults([]);
    } catch {} finally { setGeoLoad(false); }
  }

  function pick(r) {
    const s = r.display_name.split(',').slice(0, 2).join(',').trim();
    setQuery(s); onChange(s); setResults([]);
  }

  if (readOnly) {
    return value ? (
      <div className="flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400">
        <PinIcon /> <span>{value}</span>
      </div>
    ) : null;
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[#61dbbb]"><PinIcon /></span>
        <input
          type="text" value={query}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); }}
          onBlur={() => setTimeout(() => setResults([]), 200)}
          placeholder="Where are you?"
          className="flex-1 bg-transparent text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 outline-none"
        />
        <button type="button" onClick={detect} disabled={geoLoad} className="shrink-0 text-neutral-400 hover:text-[#61dbbb] transition disabled:opacity-40">
          {geoLoad
            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
          }
        </button>
      </div>
      {results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/8 dark:ring-white/8 py-1">
          {results.map(r => (
            <button key={r.place_id} onMouseDown={e => e.preventDefault()} onClick={() => pick(r)}
              className="flex w-full items-center px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
              <span className="truncate">{r.display_name.split(',').slice(0, 3).join(', ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TagsEditor ───────────────────────────────────────────────────────────────

const PRESET_TAGS = ['Funny', 'Sweet', 'Us', 'Adventure', 'Proud', 'Grateful', 'Milestone', 'Silly'];

function TagsEditor({ tags, onChange, allTags, readOnly }) {
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState('');

  const pool = [...new Set([...PRESET_TAGS, ...allTags])].filter(t => !tags.includes(t));
  const sugg = input.trim() ? pool.filter(t => t.toLowerCase().includes(input.toLowerCase())) : pool.slice(0, 8);

  function add(tag) {
    const t = tag.trim(); if (!t || tags.includes(t)) { setInput(''); setOpen(false); return; }
    onChange([...tags, t]); setInput(''); setOpen(false);
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {tags.map(t => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[#61dbbb]/15 dark:bg-[#61dbbb]/20 px-2.5 py-0.5 text-xs font-medium text-[#1f8a6b] dark:text-[#61dbbb]">
          {t}
          {!readOnly && (
            <button onClick={() => onChange(tags.filter(x => x !== t))} className="leading-none opacity-60 hover:opacity-100">×</button>
          )}
        </span>
      ))}
      {!readOnly && (
        open ? (
          <div className="relative">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(input); } if (e.key === 'Escape') { setInput(''); setOpen(false); } }}
              onBlur={() => setTimeout(() => { setInput(''); setOpen(false); }, 200)}
              placeholder="Add tag…"
              autoFocus
              className="rounded-full border border-[#61dbbb]/40 bg-transparent px-2.5 py-0.5 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 outline-none focus:border-[#61dbbb]"
              style={{ minWidth: 80 }}
            />
            {sugg.length > 0 && (
              <div className="absolute left-0 top-full z-40 mt-1 min-w-[140px] overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/8 dark:ring-white/8 py-1">
                {sugg.map(s => (
                  <button key={s} onMouseDown={e => e.preventDefault()} onClick={() => add(s)}
                    className="flex w-full items-center px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => setOpen(true)}
            className="rounded-full border border-neutral-200 px-2.5 py-0.5 text-xs text-neutral-500 hover:border-[#61dbbb] hover:text-[#1f8a6b] dark:hover:text-[#61dbbb] transition-colors">
            + tag
          </button>
        )
      )}
    </div>
  );
}

// ─── MediaSection ─────────────────────────────────────────────────────────────

function MediaSection({ media, momentId, canEdit, onMediaAdded, onMediaRemoved }) {
  const images = media.filter(m => m.type === 'image');
  const voices = media.filter(m => m.type === 'voice');
  const photoRef   = useRef(null);
  const recRef     = useRef(null);
  const chunksRef  = useRef([]);
  const mimeRef    = useRef('');
  const timerRef   = useRef(null);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs]     = useState(0);
  const [recBlob, setRecBlob]     = useState(null);
  const [recUrl, setRecUrl]       = useState(null);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox]   = useState(null);

  async function addPhoto(e) {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = '';
    setUploading(true);
    try { const { url } = await api.upload(file); onMediaAdded(await api.addMomentMedia(momentId, url, 'image')); }
    catch {} finally { setUploading(false); }
  }

  async function toggleRec() {
    if (recording) { clearInterval(timerRef.current); recRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      mimeRef.current = mime;
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(timerRef.current);
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mime });
        setRecBlob(blob); setRecUrl(URL.createObjectURL(blob));
      };
      rec.start(); recRef.current = rec;
      setRecSecs(0); setRecording(true);
      timerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);
    } catch {}
  }

  async function confirmVoice() {
    if (!recBlob) return;
    const blob = recBlob; const url = recUrl;
    setRecBlob(null); setRecUrl(null); setRecSecs(0);
    URL.revokeObjectURL(url);
    setUploading(true);
    try {
      const ext = mimeRef.current.includes('webm') ? 'webm' : 'm4a';
      const file = new File([blob], `voice-note.${ext}`, { type: mimeRef.current });
      const { url: uploadUrl } = await api.upload(file);
      onMediaAdded(await api.addMomentMedia(momentId, uploadUrl, 'voice'));
    } catch {} finally { setUploading(false); }
  }

  function discardVoice() {
    if (recUrl) URL.revokeObjectURL(recUrl);
    setRecBlob(null); setRecUrl(null); setRecSecs(0);
  }

  return (
    <div className="space-y-2.5">
      {images.length > 0 && (
        <div className={`grid gap-1 ${images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {images.map(img => (
            <div key={img.id} className="relative aspect-square overflow-hidden rounded-xl">
              <img src={img.url} alt="" className="h-full w-full object-cover cursor-pointer" onClick={() => setLightbox(img.url)} />
              {canEdit && (
                <button onClick={() => onMediaRemoved(img.id)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}>×</button>
              )}
            </div>
          ))}
        </div>
      )}
      {voices.map(v => (
        <div key={v.id} className="flex items-center gap-2">
          <div className="flex-1"><AudioPlayer src={v.url} /></div>
          {canEdit && (
            <button onClick={() => onMediaRemoved(v.id)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#3a1818] text-[#fca5a5] text-sm font-bold">×</button>
          )}
        </div>
      ))}
      {recUrl && (
        <div className="flex items-center gap-2">
          <div className="flex-1"><AudioPlayer src={recUrl} /></div>
          <button onClick={confirmVoice} disabled={uploading} className="rounded-full px-2.5 py-1 text-xs font-semibold text-white active:scale-95" style={{ background: '#61dbbb', color: '#0a2a23' }}>{uploading ? '…' : 'Add'}</button>
          <button onClick={discardVoice} className="rounded-full bg-[#3a1818] px-2.5 py-1 text-xs font-semibold text-[#fca5a5]">Discard</button>
        </div>
      )}
      {canEdit && !recUrl && (
        <div className="flex items-center gap-2">
          {recording && (
            <span className="text-xs font-medium text-red-500 animate-pulse tabular-nums">
              {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, '0')}
            </span>
          )}
          <button type="button" onClick={() => photoRef.current?.click()} disabled={uploading}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-400 hover:border-[#61dbbb] hover:text-[#1f8a6b] dark:hover:text-[#61dbbb] transition-colors disabled:opacity-40">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
          <button type="button" onClick={toggleRec}
            className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors active:scale-95 ${recording ? 'border-red-300 bg-red-50 text-red-500 animate-pulse' : 'border-neutral-200 text-neutral-400 hover:border-[#61dbbb] hover:text-[#1f8a6b] dark:hover:text-[#61dbbb]'}`}>
            {recording
              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
            }
          </button>
          <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={addPhoto} />
        </div>
      )}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white text-xl leading-none">×</button>
        </div>
      )}
    </div>
  );
}

// ─── Moment Toolbar (identical grid layout to NoteToolbar) ────────────────────

function MomentToolbar({ editor }) {
  if (!editor) return null;

  const Btn = ({ active, onMd, title: t, children }) => (
    <button onMouseDown={onMd} title={t} className={`notes-tb-btn${active ? ' notes-tb-active' : ''}`}>
      {children}
    </button>
  );

  function indent() {
    if (editor.isActive('taskList')) editor.chain().focus().sinkListItem('taskItem').run();
    else if (editor.isActive('bulletList') || editor.isActive('orderedList')) editor.chain().focus().sinkListItem('listItem').run();
  }
  function outdent() {
    if (editor.isActive('taskList')) editor.chain().focus().liftListItem('taskItem').run();
    else if (editor.isActive('bulletList') || editor.isActive('orderedList')) editor.chain().focus().liftListItem('listItem').run();
  }

  const ROW_DIVIDER = <div className="notes-tb-row-break" />;

  return (
    <div className="notes-toolbar relative select-none">
      <div className="notes-tb-grid">
        {/* Row 1 */}
        <Btn active={editor.isActive('bold')} onMd={e => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }} title="Bold">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h8a4 4 0 0 1 0 8H6V4zM6 12h9a4 4 0 0 1 0 8H6V12z"/></svg>
        </Btn>
        <Btn active={editor.isActive('italic')} onMd={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }} title="Italic">
          <svg width="20" height="22" viewBox="0 0 22 24" fill="currentColor"><path d="M10 4h6M6 20h6M14 4 8 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/></svg>
        </Btn>
        <Btn active={editor.isActive('underline')} onMd={e => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }} title="Underline">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" y1="22" x2="20" y2="22"/></svg>
        </Btn>
        <Btn active={editor.isActive('strike')} onMd={e => { e.preventDefault(); editor.chain().focus().toggleStrike().run(); }} title="Strikethrough">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><path d="M16 6c0 0-1-2-4-2s-4.5 1.5-4.5 3.5C7.5 10 9.5 11 12 12"/><path d="M8 18c0 0 1 2 4 2s4.5-1.5 4.5-3.5C16.5 14.5 15 13 12 12"/></svg>
        </Btn>

        {ROW_DIVIDER}

        {/* Row 2 */}
        <Btn active={editor.isActive('highlight')} onMd={e => { e.preventDefault(); editor.chain().focus().toggleHighlight().run(); }} title="Highlight">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
        </Btn>
        <Btn active={editor.isActive('taskList')} onMd={e => { e.preventDefault(); editor.chain().focus().toggleTaskList().run(); }} title="Checklist">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        </Btn>
        <Btn active={editor.isActive('bulletList')} onMd={e => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }} title="Bullet list">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="4" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="2" fill="currentColor" stroke="none"/>
            <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
          </svg>
        </Btn>
        <Btn active={editor.isActive('orderedList')} onMd={e => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }} title="Numbered list">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/>
            <text x="1.5" y="8.5" fontSize="8" fill="currentColor" stroke="none" fontWeight="700">1</text>
            <text x="1.5" y="14.5" fontSize="8" fill="currentColor" stroke="none" fontWeight="700">2</text>
            <text x="1.5" y="20.5" fontSize="8" fill="currentColor" stroke="none" fontWeight="700">3</text>
          </svg>
        </Btn>

        {ROW_DIVIDER}

        {/* Row 3 */}
        <Btn active={false} onMd={e => { e.preventDefault(); outdent(); }} title="Decrease indent">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/>
            <polyline points="11 7 8 10 11 13"/>
          </svg>
        </Btn>
        <Btn active={false} onMd={e => { e.preventDefault(); indent(); }} title="Increase indent">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/>
            <polyline points="7 7 10 10 7 13"/>
          </svg>
        </Btn>
        <Btn active={false} onMd={e => { e.preventDefault(); editor.chain().focus().unsetAllMarks().clearNodes().run(); }} title="Clear formatting">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 1.397.009l2.596 2.595a1 1 0 0 1 .009 1.397L8.059 19.39a1 1 0 0 1-.728.312H4.586a1 1 0 0 1-.707-1.707z"/>
            <line x1="3" y1="3" x2="21" y2="21"/>
          </svg>
        </Btn>
        {/* empty 12th cell for even grid */}
        <div />
      </div>
    </div>
  );
}

// ─── MomentEditor (own moments) ───────────────────────────────────────────────

function MomentEditor({ moment, partnerName, onUpdate, onPromote, onDelete }) {
  const [location, setLocation] = useState(moment.location ?? '');
  const [tags,     setTags]     = useState(moment.tags ?? []);
  const [media,    setMedia]    = useState(moment.media ?? []);
  const [saving,   setSaving]   = useState(false);
  const [savedAt,  setSavedAt]  = useState(null);
  const [promoting, setPromoting] = useState(false);
  const saveTimer   = useRef(null);
  const latestBody  = useRef(moment.body ?? '');
  const latestLoc   = useRef(moment.location ?? '');
  const latestTags  = useRef(moment.tags ?? []);
  const onUpdateRef = useRef(null);

  const editor = useEditor({
    extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true }), Highlight, Underline, Placeholder.configure({ placeholder: 'What are you thinking?' })],
    content: moment.body || '',
    onUpdate: ({ editor: ed }) => onUpdateRef.current?.(ed),
  });

  onUpdateRef.current = (ed) => { latestBody.current = ed.getHTML(); scheduleSave(); };

  function scheduleSave() {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try { const u = await api.updateMoment(moment.id, { location: latestLoc.current, body: latestBody.current, tags: latestTags.current }); onUpdate?.(u); setSavedAt(new Date()); }
      catch {} finally { setSaving(false); }
    }, 800);
  }

  function handleLoc(loc) { setLocation(loc); latestLoc.current = loc; scheduleSave(); }
  function handleTags(t)  { setTags(t);       latestTags.current = t;   scheduleSave(); }

  async function promote() {
    if (promoting) return;
    setPromoting(true);
    try { const u = await api.promoteMoment(moment.id); onPromote?.(u); }
    catch {} finally { setPromoting(false); }
  }

  async function del() {
    if (!confirm('Delete this moment?')) return;
    try { await api.deleteMoment(moment.id); onDelete?.(moment.id); } catch {}
  }

  function onMediaAdded(med)     { setMedia(p => [...p, med]); }
  async function onMediaRemoved(mediaId) {
    try { await api.removeMomentMedia(moment.id, mediaId); setMedia(p => p.filter(m => m.id !== mediaId)); } catch {}
  }

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // Reset when switching moment
  useEffect(() => {
    setLocation(moment.location ?? ''); setTags(moment.tags ?? []); setMedia(moment.media ?? []);
    latestLoc.current = moment.location ?? ''; latestTags.current = moment.tags ?? []; latestBody.current = moment.body ?? '';
    if (editor && !editor.isDestroyed) editor.commands.setContent(moment.body || '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment.id]);

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#1c1c1e]">
      <div className="flex-1 overflow-y-auto px-5 py-4 md:px-8 md:py-6 space-y-4">
        {/* Save status (desktop) */}
        <div className="hidden md:flex justify-end h-4">
          <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
            {saving ? 'Saving…' : savedAt ? `Saved ${timeAgo(savedAt.toISOString())}` : ''}
          </span>
        </div>

        {/* Date */}
        <p className="text-center text-[11px] text-neutral-400 dark:text-neutral-500">
          {momentFullDt(moment.created_at)}
        </p>

        {/* Share badge / button */}
        <div className="flex justify-center">
          {moment.type === 'shared' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#61dbbb]/15 dark:bg-[#61dbbb]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#1f8a6b] dark:text-[#61dbbb]">
              <SharedIcon size={11} /> Shared moment
            </span>
          ) : partnerName && (
            <button onClick={promote} disabled={promoting}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#61dbbb]/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#61dbbb]/60 transition hover:border-[#61dbbb] hover:text-[#61dbbb] active:scale-95 disabled:opacity-40">
              <SharedIcon size={11} />
              {promoting ? 'Sharing…' : `Share with ${partnerName}`}
            </button>
          )}
        </div>

        {/* Location */}
        <div className="rounded-xl border border-neutral-200 px-3 py-2.5">
          <LocationPicker value={location} onChange={handleLoc} />
        </div>

        {/* Body */}
        <div className="notes-content min-h-[100px]">
          <EditorContent editor={editor} />
        </div>

        {/* Media */}
        <MediaSection media={media} momentId={moment.id} canEdit onMediaAdded={onMediaAdded} onMediaRemoved={onMediaRemoved} />

        {/* Tags */}
        <TagsEditor tags={tags} onChange={handleTags} allTags={[]} />

        {/* Delete */}
        <div className="pt-4 pb-2">
          <button onClick={del} className="text-xs font-medium text-neutral-400 hover:text-[#fca5a5] transition-colors">
            Delete moment
          </button>
        </div>
      </div>
      <MomentToolbar editor={editor} />
    </div>
  );
}

// ─── MomentViewer (read-only) ─────────────────────────────────────────────────

function MomentViewer({ moment }) {
  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#1c1c1e] overflow-y-auto px-5 py-4 md:px-8 md:py-6 space-y-4">
      <p className="text-center text-[11px] text-neutral-400 dark:text-neutral-500">{momentFullDt(moment.created_at)}</p>
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#61dbbb]/15 dark:bg-[#61dbbb]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#1f8a6b] dark:text-[#61dbbb]">
          <PersonIcon size={11} /> {moment.account_name}
        </span>
      </div>
      {moment.location && (
        <div className="rounded-xl border border-neutral-200 px-3 py-2.5">
          <LocationPicker value={moment.location} readOnly />
        </div>
      )}
      {moment.body
        ? <div className="notes-content-ro" dangerouslySetInnerHTML={{ __html: moment.body }} />
        : <p className="text-sm italic text-neutral-400 dark:text-neutral-500">No thoughts shared.</p>
      }
      {(moment.media ?? []).length > 0 && (
        <MediaSection media={moment.media} momentId={moment.id} canEdit={false} onMediaAdded={() => {}} onMediaRemoved={() => {}} />
      )}
      {(moment.tags ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {moment.tags.map(t => (
            <span key={t} className="rounded-full bg-[#61dbbb]/15 dark:bg-[#61dbbb]/20 px-2.5 py-0.5 text-xs font-medium text-[#1f8a6b] dark:text-[#61dbbb]">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── New Moment Popover ───────────────────────────────────────────────────────

function NewMomentPopover({ partnerName, onCreate, onClose }) {
  return (
    <div className="absolute top-full right-0 mt-1.5 z-50 w-52 rounded-2xl bg-white shadow-2xl ring-1 ring-black/8 dark:ring-white/8 overflow-hidden py-1">
      <button onClick={() => { onCreate('personal'); onClose(); }}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
        <PersonIcon size={14} /> Just for me
      </button>
      {partnerName && (
        <>
          <div className="mx-3 h-px bg-neutral-100" />
          <button onClick={() => { onCreate('shared'); onClose(); }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-[#1f8a6b] dark:text-[#61dbbb] hover:bg-[#61dbbb]/5 dark:hover:bg-[#61dbbb]/10 transition-colors">
            <SharedIcon size={14} /> Shared with {partnerName}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Moment Row (list item) ───────────────────────────────────────────────────

function MomentRow({ moment, active, isMine, onClick, onDelete }) {
  const preview = moment.location || stripHtml(moment.body).slice(0, 60) || 'New moment';

  return (
    <div className="group relative" onContextMenu={e => e.preventDefault()}>
      <div
        onClick={onClick}
        className={`flex cursor-pointer flex-col gap-0.5 rounded-xl px-3 py-2.5 transition-colors select-none ${active ? 'bg-amber-50 dark:bg-amber-900/20' : 'hover:bg-neutral-100'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate text-sm font-semibold ${preview ? 'text-neutral-900 dark:text-white' : 'italic text-neutral-400 dark:text-neutral-500'}`}>
            {preview}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="tabular-nums text-[11px] text-neutral-400 dark:text-neutral-500">{momentShortDt(moment.created_at)}</span>
            {isMine && (
              <button
                onClick={e => { e.stopPropagation(); onDelete(); }}
                className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-neutral-300 hover:text-[#fca5a5] hover:bg-[#3a1818] transition-all"
                title="Delete"
              ><TrashIcon size={12} /></button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {moment.type === 'shared' && (
            <span className="shrink-0 rounded-full bg-[#61dbbb]/15 dark:bg-[#61dbbb]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#1f8a6b] dark:text-[#61dbbb]">shared</span>
          )}
          {!isMine && (
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500">{moment.account_name}</span>
          )}
          {(moment.tags ?? []).slice(0, 3).map(t => (
            <span key={t} className="rounded-full bg-[#61dbbb]/10 dark:bg-[#61dbbb]/15 px-1.5 py-0.5 text-[9px] font-medium text-[#1f8a6b] dark:text-[#61dbbb]">{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MomentsPage() {
  const { user } = useAuth();
  const [moments,     setMoments]     = useState(null);
  const [partner,     setPartner]     = useState(null);
  const [selected,    setSelected]    = useState(null);
  const [mobilePane,  setMobilePane]  = useState('list');
  const [creating,    setCreating]    = useState(false);
  const [showPopover, setShowPopover] = useState(false);
  const [activeTag,   setActiveTag]   = useState(null);
  const [error,       setError]       = useState(null);

  async function loadMoments(silent = false) {
    if (!silent) setMoments(null);
    try {
      const { moments: ms, partner: p } = await api.listMoments();
      setMoments(ms);
      if (p) setPartner(p);
    } catch (e) { setError(e.message); }
  }

  useEffect(() => { loadMoments(); }, []);

  // Silent poll every 5 s
  useEffect(() => {
    const id = setInterval(() => loadMoments(true), 5000);
    return () => clearInterval(id);
  }, []);

  function isMine(m) { return m.account_id === user?.id; }

  const allTags = [...new Set((moments ?? []).flatMap(m => m.tags ?? []))];
  const filtered = activeTag ? (moments ?? []).filter(m => (m.tags ?? []).includes(activeTag)) : (moments ?? []);
  const groups   = groupByMonth(filtered);

  async function createMoment(type) {
    setCreating(true);
    try {
      const m = await api.createMoment(type);
      setMoments(p => [m, ...(p ?? [])]);
      setSelected(m); setMobilePane('editor');
    } catch (e) { setError(e.message); }
    finally { setCreating(false); }
  }

  function handleUpdate(updated) {
    setMoments(p => (p ?? []).map(m => m.id === updated.id ? { ...m, ...updated } : m));
    if (selected?.id === updated.id) setSelected(p => ({ ...p, ...updated }));
  }
  function handlePromote(updated) { handleUpdate(updated); }
  function handleDelete(id) {
    setMoments(p => (p ?? []).filter(m => m.id !== id));
    setSelected(null); setMobilePane('list');
  }

  async function deleteRow(m) {
    if (!confirm('Delete this moment?')) return;
    try { await api.deleteMoment(m.id); handleDelete(m.id); } catch {}
  }

  const partnerName = partner?.name ?? null;

  // ── List panel ───────────────────────────────────────────────────────────────

  const listPanel = (
    <div className="flex h-full flex-col bg-neutral-50 dark:bg-[#1c1c1e] border-r border-neutral-200">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 pt-5 pb-3 border-b border-neutral-200">
        <h1 className="text-base font-bold text-neutral-900 dark:text-white">Sneaky Moments</h1>
        <div className="relative">
          {showPopover && <div className="fixed inset-0 z-40" onClick={() => setShowPopover(false)} />}
          <button
            onClick={() => setShowPopover(v => !v)}
            disabled={creating}
            aria-label="New moment"
            className="relative z-50 flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 transition hover:bg-amber-200 dark:hover:bg-amber-800/40 active:scale-95 disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          {showPopover && <NewMomentPopover partnerName={partnerName} onCreate={createMoment} onClose={() => setShowPopover(false)} />}
        </div>
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2 border-b border-neutral-200 scrollbar-none">
          <button onClick={() => setActiveTag(null)}
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${!activeTag ? 'bg-[#61dbbb] text-[#0a2a23]' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'}`}>
            All
          </button>
          {allTags.map(tag => (
            <button key={tag} onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${activeTag === tag ? 'bg-[#61dbbb] text-[#0a2a23]' : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'}`}>
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2">
        {error && <p className="px-2 py-1.5 text-xs text-red-500">{error}</p>}
        {moments === null && !error && (
          <p className="p-3 text-sm text-neutral-400 dark:text-neutral-500">Loading…</p>
        )}
        {moments?.length === 0 && !error && (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-300 dark:text-neutral-700">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <p className="text-sm text-neutral-400 dark:text-neutral-500">No moments yet</p>
            <button onClick={() => setShowPopover(true)} disabled={creating}
              className="rounded-xl bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800/40 transition disabled:opacity-40">
              Capture your first moment
            </button>
          </div>
        )}
        {groups.map(([month, items]) => (
          <div key={month}>
            <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
              {month}
            </p>
            {items.map(m => (
              <MomentRow
                key={m.id}
                moment={m}
                active={selected?.id === m.id}
                isMine={isMine(m)}
                onClick={() => { setSelected(m); setMobilePane('editor'); }}
                onDelete={() => deleteRow(m)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  // ── Detail panel ─────────────────────────────────────────────────────────────

  const detailPanel = selected ? (
    <div className="flex h-full flex-col bg-white dark:bg-[#1c1c1e]">
      {/* Mobile back bar */}
      <div className="flex items-center gap-2 border-b border-neutral-200 px-3 pt-5 pb-2.5 md:hidden">
        <button onClick={() => { setMobilePane('list'); setSelected(null); }}
          className="flex items-center gap-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
          <BackChevron /> Moments
        </button>
        <span className="ml-auto text-[11px] text-neutral-400 dark:text-neutral-500">
          {momentShortDt(selected.created_at)}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {isMine(selected)
          ? <MomentEditor key={selected.id} moment={selected} partnerName={partnerName} onUpdate={handleUpdate} onPromote={handlePromote} onDelete={handleDelete} />
          : <MomentViewer moment={selected} />
        }
      </div>
    </div>
  ) : (
    <div className="hidden md:flex flex-1 h-full flex-col items-center justify-center bg-white dark:bg-[#1c1c1e]">
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-200 dark:text-neutral-700">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
      <p className="mt-3 text-sm text-neutral-400 dark:text-neutral-500">Select a moment</p>
    </div>
  );

  // ── Layout ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100dvh-56px)] overflow-hidden bg-white dark:bg-[#1c1c1e]">
      {/* List */}
      <div className={`w-full md:w-72 md:flex-shrink-0 h-full ${mobilePane === 'editor' ? 'hidden md:block' : 'block'}`}>
        {listPanel}
      </div>
      {/* Detail */}
      <div className={`flex-1 min-w-0 h-full ${mobilePane === 'list' ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}>
        {detailPanel}
      </div>
    </div>
  );
}
