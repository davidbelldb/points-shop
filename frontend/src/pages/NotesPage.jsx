/**
 * Sneaky Notes — Apple Notes-style private note-taking.
 * v2: personal + shared notes, archive, trash (30-day auto-purge), iOS swipe.
 *
 * Layout:
 *   Mobile  : single-pane toggle  (list → editor with back button)
 *   Desktop : persistent two-pane (280 px list | full editor)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60)    return 'Just now';
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  const d = Math.floor(secs / 86400);
  if (d < 7)        return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function daysLeft(iso) {
  return Math.max(0, 30 - Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

function parseNote(note) {
  const lines = (note.body ?? '').split('\n');
  return { title: lines[0] || '', preview: lines.slice(1).find(l => l.trim()) ?? '' };
}

// view state → API status param
const API_STATUS = { active: 'active', archive: 'archived', trash: 'deleted' };

// ─── Icons ────────────────────────────────────────────────────────────────────

const ArchiveIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" />
  </svg>
);
const TrashIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
  </svg>
);
const RestoreIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.15" />
  </svg>
);
const BackChevron = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const PersonIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const SharedPeopleIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

// ─── Swipe Row (iOS swipe-left to reveal actions) ─────────────────────────────

function SwipeRow({ children, leftAction, rightAction }) {
  const actions   = [leftAction, rightAction].filter(Boolean);
  const TOTAL_W   = actions.length * 80;
  const containerRef = useRef(null);
  const [offset,   setOffset]   = useState(0);
  const [revealed, setRevealed] = useState(false);
  const startX  = useRef(null);
  const startY  = useRef(null);
  const lockDir = useRef(null); // 'h' | 'v' | null

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMove = (e) => {
      if (startX.current === null) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;
      if (!lockDir.current) {
        lockDir.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
      }
      if (lockDir.current !== 'h') return;
      e.preventDefault();
      const base    = revealed ? -TOTAL_W : 0;
      const clamped = Math.max(-TOTAL_W, Math.min(0, base + dx));
      setOffset(clamped);
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, [revealed, TOTAL_W]);

  const onTouchStart = (e) => {
    startX.current  = e.touches[0].clientX;
    startY.current  = e.touches[0].clientY;
    lockDir.current = null;
  };

  const onTouchEnd = () => {
    if (lockDir.current !== 'h') return;
    const snap = offset < -TOTAL_W / 2;
    setOffset(snap ? -TOTAL_W : 0);
    setRevealed(snap);
    startX.current = null;
  };

  const close = () => { setOffset(0); setRevealed(false); };

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Action buttons — mobile only */}
      <div
        className="md:hidden absolute right-0 top-0 bottom-0 flex overflow-hidden rounded-r-xl"
        style={{ width: TOTAL_W }}
      >
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={() => { close(); a.onClick(); }}
            style={{ color: a.color ?? '#ffffff' }}
            className={`flex-1 flex flex-col items-center justify-center gap-1 ${a.bg} text-[10px] font-semibold`}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
      {/* Row — slides left to reveal buttons. position+zIndex ensures the row
          always paints over the absolute buttons on iOS compositing layers. */}
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: startX.current === null ? 'transform 0.22s ease' : 'none',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Note Row ─────────────────────────────────────────────────────────────────

function NoteRow({ note, active, mode, onClick, onArchive, onDelete, onRestore, onHardDelete }) {
  const { title, preview } = parseNote(note);
  const [confirmHard, setConfirmHard] = useState(false);

  const inner = (
    <div
      onClick={onClick}
      className={`group relative flex cursor-pointer flex-col gap-0.5 rounded-xl px-3 py-2.5 transition-colors select-none ${
        active
          ? 'bg-amber-50 dark:bg-amber-900/20'
          : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        {/* Title + shared badge */}
        <div className="flex items-center gap-1.5 min-w-0">
          {note.type === 'shared' && (
            <span className="shrink-0 rounded-full bg-[#61dbbb]/20 dark:bg-[#61dbbb]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#1f8a6b] dark:text-[#61dbbb]">
              shared
            </span>
          )}
          <p className={`truncate text-sm font-semibold ${
            title
              ? 'text-neutral-900 dark:text-white'
              : 'italic text-neutral-400 dark:text-neutral-500'
          }`}>
            {title || 'New note'}
          </p>
        </div>

        {/* Desktop hover actions */}
        <div className="hidden md:flex items-center gap-0.5 shrink-0">
          {mode === 'active' && (
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(); }}
              title="Archive"
              className="rounded p-1 opacity-0 group-hover:opacity-100 transition-all text-neutral-400 dark:text-neutral-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            ><ArchiveIcon size={13} /></button>
          )}
          {(mode === 'archive' || mode === 'trash') && (
            <button
              onClick={(e) => { e.stopPropagation(); onRestore(); }}
              title="Restore"
              className="rounded p-1 opacity-0 group-hover:opacity-100 transition-all text-neutral-400 dark:text-neutral-500 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            ><RestoreIcon size={13} /></button>
          )}
          {mode !== 'trash' && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Move to trash"
              className="rounded p-1 opacity-0 group-hover:opacity-100 transition-all text-neutral-400 dark:text-neutral-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            ><TrashIcon size={13} /></button>
          )}
          {mode === 'trash' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!confirmHard) { setConfirmHard(true); setTimeout(() => setConfirmHard(false), 2500); return; }
                onHardDelete();
              }}
              title="Delete permanently"
              className={`rounded p-1 opacity-0 group-hover:opacity-100 transition-all ${
                confirmHard
                  ? 'text-red-600 bg-red-50 dark:bg-red-900/20 opacity-100'
                  : 'text-neutral-400 dark:text-neutral-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
              }`}
            >
              {confirmHard
                ? <span className="text-[9px] font-bold px-0.5">Sure?</span>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              }
            </button>
          )}
        </div>
      </div>

      {/* Timestamp + preview */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[10px] text-neutral-400 dark:text-neutral-500">
          {mode === 'trash' && note.deleted_at
            ? `${daysLeft(note.deleted_at)}d left`
            : timeAgo(note.updated_at)}
        </span>
        {preview && (
          <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">{preview}</p>
        )}
      </div>
    </div>
  );

  if (mode === 'active') {
    return (
      <SwipeRow
        leftAction={{ label: 'Archive', bg: 'bg-[#2a5a4f]',   color: '#61dbbb', icon: <ArchiveIcon size={18} />, onClick: onArchive }}
        rightAction={{ label: 'Delete',  bg: 'bg-red-500',     color: '#ffffff', icon: <TrashIcon size={18} />,   onClick: onDelete  }}
      >{inner}</SwipeRow>
    );
  }
  if (mode === 'archive') {
    return (
      <SwipeRow
        leftAction={{ label: 'Restore', bg: 'bg-[#2a5a4f]',   color: '#61dbbb', icon: <RestoreIcon size={18} />, onClick: onRestore }}
        rightAction={{ label: 'Delete',  bg: 'bg-red-500',     color: '#ffffff', icon: <TrashIcon size={18} />,   onClick: onDelete  }}
      >{inner}</SwipeRow>
    );
  }
  if (mode === 'trash') {
    return (
      <SwipeRow
        leftAction={{ label: 'Restore', bg: 'bg-[#2a5a4f]',   color: '#61dbbb', icon: <RestoreIcon size={18} />, onClick: onRestore    }}
        rightAction={{ label: 'Delete',  bg: 'bg-red-500',     color: '#ffffff', icon: <TrashIcon size={18} />,   onClick: onHardDelete }}
      >{inner}</SwipeRow>
    );
  }
  return inner;
}

// ─── Note Editor ──────────────────────────────────────────────────────────────

function NoteEditor({ note, onBack, onSaved, readOnly }) {
  const titleRef   = useRef(null);
  const bodyRef    = useRef(null);
  const saveTimer  = useRef(null);
  const latestBody = useRef(note.body ?? '');

  const splitBody = (raw) => {
    const idx = raw.indexOf('\n');
    return idx === -1 ? { title: raw, body: '' } : { title: raw.slice(0, idx), body: raw.slice(idx + 1) };
  };

  const [title,   setTitle]   = useState(() => splitBody(note.body ?? '').title);
  const [body,    setBody]    = useState(() => splitBody(note.body ?? '').body);
  const [saving,  setSaving]  = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    const { title: t, body: b } = splitBody(note.body ?? '');
    setTitle(t); setBody(b);
    latestBody.current = note.body ?? '';
    clearTimeout(saveTimer.current);
    setSavedAt(null);
  }, [note.id]);

  const resize = (ref) => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = ref.current.scrollHeight + 'px';
  };
  const resizeTitle = useCallback(() => resize(titleRef), []);
  const resizeBody  = useCallback(() => resize(bodyRef),  []);
  useEffect(() => { resizeTitle(); }, [title, resizeTitle]);
  useEffect(() => { resizeBody();  }, [body,  resizeBody]);

  const scheduleSave = useCallback((newTitle, newBody) => {
    const combined = newTitle + (newBody ? '\n' + newBody : '');
    latestBody.current = combined;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const saved = await api.updateNote(note.id, latestBody.current);
        onSaved(saved);
        setSavedAt(new Date());
      } catch (e) {
        console.error('Auto-save failed', e);
      } finally {
        setSaving(false);
      }
    }, 800);
  }, [note.id, onSaved]);

  useEffect(() => {
    if (!note.body) titleRef.current?.focus();
  }, [note.id, note.body]);

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#1c1c1e]">
      {/* Mobile back bar (hidden on md+) */}
      {onBack && (
        <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 px-3 py-2.5 md:hidden">
          <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-amber-600 dark:text-amber-400">
            <BackChevron size={16} /> Notes
          </button>
          {!readOnly && (
            <span className="ml-auto text-[11px] text-neutral-400 dark:text-neutral-500">
              {saving ? 'Saving…' : savedAt ? `Saved ${timeAgo(savedAt.toISOString())}` : ''}
            </span>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4 md:px-8 md:py-6">
        {/* Desktop save status */}
        {!readOnly && (
          <div className="hidden md:flex justify-end mb-3 h-4">
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
              {saving ? 'Saving…' : savedAt ? `Saved ${timeAgo(savedAt.toISOString())}` : ''}
            </span>
          </div>
        )}

        {/* Date */}
        <p className="mb-3 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
          {new Date(note.updated_at).toLocaleDateString(undefined, {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          })}
        </p>

        {/* Shared badge */}
        {note.type === 'shared' && (
          <div className="mb-5 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#61dbbb]/15 dark:bg-[#61dbbb]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#1f8a6b] dark:text-[#61dbbb]">
              <SharedPeopleIcon size={11} /> Shared note
            </span>
          </div>
        )}

        {readOnly ? (
          /* Read-only view for archive / trash */
          <div>
            <h1 className="mb-3 text-2xl font-bold leading-snug text-neutral-900 dark:text-white">
              {title || <span className="italic text-neutral-300 dark:text-neutral-600">Untitled</span>}
            </h1>
            <p className="whitespace-pre-wrap text-base leading-relaxed text-neutral-700 dark:text-neutral-300">{body}</p>
          </div>
        ) : (
          <>
            <textarea
              ref={titleRef}
              value={title}
              onChange={(e) => { const v = e.target.value.replace(/\n/g, ''); setTitle(v); scheduleSave(v, body); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); bodyRef.current?.focus(); } }}
              placeholder="Title"
              rows={1}
              className="w-full resize-none overflow-hidden bg-transparent text-2xl font-bold leading-snug text-neutral-900 dark:text-white placeholder:text-neutral-300 dark:placeholder:text-neutral-700 focus:outline-none"
            />
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => { setBody(e.target.value); scheduleSave(title, e.target.value); }}
              placeholder="Start writing…"
              rows={6}
              className="mt-3 w-full resize-none overflow-hidden bg-transparent text-base leading-relaxed text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-300 dark:placeholder:text-neutral-700 focus:outline-none"
            />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ message }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-white dark:bg-[#1c1c1e] px-8 text-center">
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-200 dark:text-neutral-700">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
      <p className="text-sm text-neutral-400 dark:text-neutral-500">{message}</p>
    </div>
  );
}

// ─── New Note Popover ─────────────────────────────────────────────────────────

function NewNotePopover({ onCreate, onClose }) {
  return (
    <div className="absolute top-full right-0 mt-1.5 z-50 w-48 rounded-2xl bg-white dark:bg-neutral-800 shadow-2xl ring-1 ring-black/8 dark:ring-white/8 overflow-hidden py-1">
      <button
        onClick={() => { onCreate('personal'); onClose(); }}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700/60 transition-colors"
      >
        <PersonIcon size={14} /> Personal note
      </button>
      <div className="mx-3 h-px bg-neutral-100 dark:bg-neutral-700" />
      <button
        onClick={() => { onCreate('shared'); onClose(); }}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-[#1f8a6b] dark:text-[#61dbbb] hover:bg-[#61dbbb]/5 dark:hover:bg-[#61dbbb]/10 transition-colors"
      >
        <SharedPeopleIcon size={14} /> Shared with Katie
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotesPage() {
  const [notes,        setNotes]        = useState(null);
  const [active,       setActive]       = useState(null);
  const [view,         setView]         = useState('active'); // 'active'|'archive'|'trash'
  const [mobilePane,   setMobilePane]   = useState('list');   // 'list'|'editor'
  const [error,        setError]        = useState(null);
  const [creating,     setCreating]     = useState(false);
  const [showPopover,  setShowPopover]  = useState(false);
  const [footerCounts, setFooterCounts] = useState({ archive: 0, trash: 0 });

  // Load notes whenever view changes
  useEffect(() => {
    setNotes(null);
    setActive(null);
    setError(null);
    api.listNotes(API_STATUS[view])
      .then(setNotes)
      .catch((e) => setError(e.message));
  }, [view]);

  // Refresh archive / trash counts for footer badges
  const refreshCounts = useCallback(() => {
    Promise.all([api.listNotes('archived'), api.listNotes('deleted')])
      .then(([arch, trash]) => setFooterCounts({ archive: arch.length, trash: trash.length }))
      .catch(() => {});
  }, []);

  useEffect(() => { refreshCounts(); }, [view, refreshCounts]);

  const activeNote = notes?.find((n) => n.id === active) ?? null;

  // ── Mutations ───────────────────────────────────────────────────────────────

  async function createNote(type = 'personal') {
    setCreating(true);
    try {
      const note = await api.createNote(type);
      setNotes((prev) => [note, ...(prev ?? [])]);
      setActive(note.id);
      setMobilePane('editor');
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  const removeFromList = (id) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (active === id) { setActive(null); setMobilePane('list'); }
  };

  async function archiveNote(id) {
    try { await api.archiveNote(id); removeFromList(id); refreshCounts(); }
    catch (e) { setError(e.message); }
  }
  async function deleteNote(id) {
    try { await api.deleteNote(id); removeFromList(id); refreshCounts(); }
    catch (e) { setError(e.message); }
  }
  async function restoreNote(id) {
    try { await api.restoreNote(id); removeFromList(id); refreshCounts(); }
    catch (e) { setError(e.message); }
  }
  async function hardDeleteNote(id) {
    try { await api.hardDeleteNote(id); removeFromList(id); refreshCounts(); }
    catch (e) { setError(e.message); }
  }

  function handleSaved(updated) {
    setNotes((prev) =>
      [...prev.map((n) => (n.id === updated.id ? updated : n))]
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    );
  }

  // ── List grouping ───────────────────────────────────────────────────────────

  const sharedNotes   = view === 'active' ? (notes?.filter((n) => n.type === 'shared')   ?? []) : [];
  const personalNotes = view === 'active' ? (notes?.filter((n) => n.type === 'personal') ?? []) : (notes ?? []);

  const rowProps = (note) => ({
    key: note.id, note,
    active: note.id === active,
    mode: view,
    onClick:      () => { setActive(note.id); setMobilePane('editor'); },
    onArchive:    () => archiveNote(note.id),
    onDelete:     () => deleteNote(note.id),
    onRestore:    () => restoreNote(note.id),
    onHardDelete: () => hardDeleteNote(note.id),
  });

  const viewLabel = { active: 'Sneaky Notes', archive: 'Archive', trash: 'Recently Deleted' };
  const emptyMsg  = { active: 'No sneaky notes yet…', archive: 'Archive is empty', trash: 'Trash is empty' };

  // ── List panel ──────────────────────────────────────────────────────────────

  const listPanel = (
    <div className="flex h-full flex-col bg-neutral-50 dark:bg-[#1c1c1e] border-r border-neutral-200 dark:border-neutral-800">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 pt-5 pb-3 border-b border-neutral-200 dark:border-neutral-800">
        {view !== 'active' ? (
          <button
            onClick={() => setView('active')}
            className="flex items-center gap-1 text-sm font-medium text-amber-600 dark:text-amber-400"
          >
            <BackChevron size={15} />
            <span className="font-bold text-neutral-900 dark:text-white">{viewLabel[view]}</span>
          </button>
        ) : (
          <h1 className="text-base font-bold text-neutral-900 dark:text-white">Sneaky Notes</h1>
        )}

        {view === 'active' && (
          <div className="relative">
            {/* Backdrop — closes popover when tapping outside, sits above scroll container */}
            {showPopover && (
              <div className="fixed inset-0 z-40" onClick={() => setShowPopover(false)} />
            )}
            <button
              onClick={() => setShowPopover((v) => !v)}
              disabled={creating}
              aria-label="New note"
              className="relative z-50 flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 transition hover:bg-amber-200 dark:hover:bg-amber-800/40 active:scale-95 disabled:opacity-40"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            {showPopover && <NewNotePopover onCreate={createNote} onClose={() => setShowPopover(false)} />}
          </div>
        )}
      </div>

      {/* Note list */}
      <div className="flex-1 overflow-y-auto p-2">
        {error && <p className="px-2 py-1.5 text-xs text-red-500">{error}</p>}

        {notes === null && !error && (
          <p className="p-3 text-sm text-neutral-400 dark:text-neutral-500">Loading…</p>
        )}

        {notes?.length === 0 && !error && (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-300 dark:text-neutral-700">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="text-sm text-neutral-400 dark:text-neutral-500">{emptyMsg[view]}</p>
            {view === 'active' && (
              <button
                onClick={() => createNote('personal')}
                disabled={creating}
                className="rounded-xl bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-400 transition hover:bg-amber-200 dark:hover:bg-amber-800/40 disabled:opacity-40"
              >
                Create your first note
              </button>
            )}
          </div>
        )}

        {/* Active: shared section + personal section */}
        {view === 'active' && notes && notes.length > 0 && (
          <>
            {sharedNotes.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                  Shared
                </p>
                {sharedNotes.map((note) => <NoteRow {...rowProps(note)} />)}
                {personalNotes.length > 0 && (
                  <div className="my-1.5 mx-3 h-px bg-neutral-200 dark:bg-neutral-800" />
                )}
              </>
            )}
            {personalNotes.length > 0 && (
              <>
                {sharedNotes.length > 0 && (
                  <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                    Personal
                  </p>
                )}
                {personalNotes.map((note) => <NoteRow {...rowProps(note)} />)}
              </>
            )}
          </>
        )}

        {/* Archive / trash — flat list */}
        {view !== 'active' && notes && notes.map((note) => <NoteRow {...rowProps(note)} />)}
      </div>

      {/* Footer: Archive + Trash links */}
      {view === 'active' && (
        <div className="flex gap-1 border-t border-neutral-200 dark:border-neutral-800 p-2">
          <button
            onClick={() => setView('archive')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <ArchiveIcon size={12} />
            Archive
            {footerCounts.archive > 0 && (
              <span className="rounded-full bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-neutral-600 dark:text-neutral-300">
                {footerCounts.archive}
              </span>
            )}
          </button>
          <div className="my-1 w-px bg-neutral-200 dark:bg-neutral-800" />
          <button
            onClick={() => setView('trash')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <TrashIcon size={12} />
            Deleted
            {footerCounts.trash > 0 && (
              <span className="rounded-full bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-neutral-600 dark:text-neutral-300">
                {footerCounts.trash}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );

  // ── Editor panel ────────────────────────────────────────────────────────────

  const editorPanel = activeNote ? (
    <NoteEditor
      key={activeNote.id}
      note={activeNote}
      onBack={() => setMobilePane('list')}
      onSaved={handleSaved}
      readOnly={view !== 'active'}
    />
  ) : (
    <EmptyState
      message={
        view === 'active'
          ? 'Select a sneaky note or create a new one'
          : 'Select a note to view'
      }
    />
  );

  // ── Layout ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 md:left-56 bg-neutral-50 dark:bg-[#1c1c1e]"
      style={{ top: '57px' }}
    >
      {/* Desktop two-pane */}
      <div className="hidden md:grid h-full" style={{ gridTemplateColumns: '280px 1fr' }}>
        {/* No overflow-hidden on list panel — allows the New Note popover to escape */}
        <div className="h-full">{listPanel}</div>
        <div className="h-full overflow-hidden">{editorPanel}</div>
      </div>

      {/* Mobile single-pane */}
      <div className="flex h-full flex-col md:hidden">
        {mobilePane === 'list'
          ? <div className="h-full">{listPanel}</div>
          : <div className="h-full overflow-hidden">{editorPanel}</div>
        }
      </div>
    </div>
  );
}
