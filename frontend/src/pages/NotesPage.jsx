/**
 * Sneaky Notes — Apple Notes-style private note-taking.
 *
 * Layout:
 *   Mobile  : list view → tap → full-screen editor with back button
 *   Desktop : persistent two-pane (list left, editor right)
 *
 * First line of each note is its "title" (bold, larger). The rest is the body.
 * Notes auto-save 800 ms after the user stops typing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useTheme } from '../lib/ThemeContext.jsx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60)   return 'Just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  const d = Math.floor(secs / 86400);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function parseNote(note) {
  const lines = (note.body ?? '').split('\n');
  const title   = lines[0] || '';
  const preview = lines.slice(1).find(l => l.trim()) ?? '';
  return { title, preview };
}

// ─── Note list item ───────────────────────────────────────────────────────────

function NoteRow({ note, active, onClick, onDelete }) {
  const { title, preview } = parseNote(note);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDelete(e) {
    e.stopPropagation();
    if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 2500); return; }
    onDelete();
  }

  return (
    <div
      onClick={onClick}
      className={`group relative flex cursor-pointer flex-col gap-0.5 rounded-xl px-3 py-2.5 transition-colors ${
        active ? 'bg-amber-50 dark:bg-amber-900/20' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={`truncate text-sm font-semibold ${title ? 'text-neutral-900 dark:text-white' : 'italic text-neutral-400'}`}>
          {title || 'New note'}
        </p>
        <button
          onClick={handleDelete}
          className={`shrink-0 text-xs transition-colors ${
            confirmDelete ? 'text-red-500' : 'text-neutral-300 dark:text-neutral-600 opacity-0 group-hover:opacity-100'
          }`}
          aria-label="Delete note"
        >
          {confirmDelete ? 'Delete?' : '✕'}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-neutral-400 shrink-0">{timeAgo(note.updated_at)}</span>
        {preview && <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">{preview}</p>}
      </div>
    </div>
  );
}

// ─── Editor ───────────────────────────────────────────────────────────────────

function NoteEditor({ note, onBack, onSaved }) {
  const titleRef = useRef(null);
  const bodyRef  = useRef(null);
  const saveTimer = useRef(null);
  const latestBody = useRef(note.body ?? '');

  // Split stored body into title / rest for the two textareas
  const splitBody = (raw) => {
    const idx = raw.indexOf('\n');
    if (idx === -1) return { title: raw, body: '' };
    return { title: raw.slice(0, idx), body: raw.slice(idx + 1) };
  };

  const [title, setTitle] = useState(() => splitBody(note.body ?? '').title);
  const [body,  setBody]  = useState(() => splitBody(note.body ?? '').body);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  // When note changes (user selects a different one), reset editor state
  useEffect(() => {
    const { title: t, body: b } = splitBody(note.body ?? '');
    setTitle(t);
    setBody(b);
    latestBody.current = note.body ?? '';
    clearTimeout(saveTimer.current);
    setSavedAt(null);
  }, [note.id]);

  // Auto-resize both textareas
  const resizeTitle = useCallback(() => {
    if (!titleRef.current) return;
    titleRef.current.style.height = 'auto';
    titleRef.current.style.height = titleRef.current.scrollHeight + 'px';
  }, []);
  const resizeBody = useCallback(() => {
    if (!bodyRef.current) return;
    bodyRef.current.style.height = 'auto';
    bodyRef.current.style.height = bodyRef.current.scrollHeight + 'px';
  }, []);

  useEffect(() => { resizeTitle(); }, [title, resizeTitle]);
  useEffect(() => { resizeBody();  }, [body,  resizeBody]);

  // Schedule auto-save 800 ms after last keystroke
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

  function handleTitleChange(e) {
    const val = e.target.value.replace(/\n/g, ''); // no newlines in title
    setTitle(val);
    scheduleSave(val, body);
  }

  function handleTitleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      bodyRef.current?.focus();
    }
  }

  function handleBodyChange(e) {
    setBody(e.target.value);
    scheduleSave(title, e.target.value);
  }

  // Focus title on mount for brand new notes
  useEffect(() => {
    if (!note.body) titleRef.current?.focus();
  }, [note.id, note.body]);

  return (
    <div className="flex h-full flex-col">
      {/* Mobile back bar */}
      {onBack && (
        <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 px-3 py-2.5 md:hidden">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm font-medium text-amber-600 dark:text-amber-400"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Notes
          </button>
          <span className="ml-auto text-[11px] text-neutral-400">
            {saving ? 'Saving…' : savedAt ? `Saved ${timeAgo(savedAt.toISOString())}` : ''}
          </span>
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 md:px-8 md:py-6">
        {/* Save status — desktop only */}
        <div className="hidden md:block mb-3 h-4 text-right text-[11px] text-neutral-400">
          {saving ? 'Saving…' : savedAt ? `Saved ${timeAgo(savedAt.toISOString())}` : ''}
        </div>

        {/* Date */}
        <p className="mb-3 text-center text-[11px] text-neutral-400">
          {new Date(note.updated_at).toLocaleDateString(undefined, {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          })}
        </p>

        {/* Title textarea */}
        <textarea
          ref={titleRef}
          value={title}
          onChange={handleTitleChange}
          onKeyDown={handleTitleKeyDown}
          placeholder="Title"
          rows={1}
          className="w-full resize-none overflow-hidden bg-transparent text-2xl font-bold text-neutral-900 dark:text-white placeholder:text-neutral-300 dark:placeholder:text-neutral-600 focus:outline-none"
          style={{ lineHeight: '1.3' }}
        />

        {/* Body textarea */}
        <textarea
          ref={bodyRef}
          value={body}
          onChange={handleBodyChange}
          placeholder="Start writing…"
          rows={6}
          className="mt-3 w-full resize-none overflow-hidden bg-transparent text-base leading-relaxed text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-300 dark:placeholder:text-neutral-600 focus:outline-none"
        />
      </div>
    </div>
  );
}

// ─── Empty state (no note selected on desktop) ────────────────────────────────

function EmptyEditor() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-400 dark:text-neutral-600">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
      <p className="text-sm">Select a note or create one</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotesPage() {
  const { theme } = useTheme();
  const [notes,    setNotes]    = useState(null);
  const [active,   setActive]   = useState(null); // selected note id
  const [mobileView, setMobileView] = useState('list'); // 'list' | 'editor'
  const [error,    setError]    = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.listNotes()
      .then((data) => { setNotes(data); })
      .catch((e) => setError(e.message));
  }, []);

  const activeNote = notes?.find(n => n.id === active) ?? null;

  async function createNote() {
    setCreating(true);
    try {
      const note = await api.createNote();
      setNotes(prev => [note, ...(prev ?? [])]);
      setActive(note.id);
      setMobileView('editor');
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  function selectNote(id) {
    setActive(id);
    setMobileView('editor');
  }

  async function deleteNote(id) {
    try {
      await api.deleteNote(id);
      setNotes(prev => prev.filter(n => n.id !== id));
      if (active === id) {
        setActive(null);
        setMobileView('list');
      }
    } catch (e) {
      setError(e.message);
    }
  }

  // Called by editor after each successful auto-save
  function handleSaved(updated) {
    setNotes(prev =>
      prev
        .map(n => n.id === updated.id ? updated : n)
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    );
  }

  // ── List panel ──────────────────────────────────────────────────────────────
  const listPanel = (
    <div className="flex h-full flex-col border-r border-neutral-200 dark:border-neutral-800">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <h1 className="text-base font-bold text-neutral-900 dark:text-white">Sneaky Notes</h1>
        <button
          onClick={createNote}
          disabled={creating}
          aria-label="New note"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 transition hover:bg-amber-200 dark:hover:bg-amber-800/40 active:scale-95 disabled:opacity-40"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2">
        {error && <p className="p-2 text-xs text-red-500">{error}</p>}
        {notes === null && !error && (
          <p className="p-3 text-sm text-neutral-400">Loading…</p>
        )}
        {notes?.length === 0 && (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className="text-neutral-300 dark:text-neutral-600" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="text-sm text-neutral-400 dark:text-neutral-500">No notes yet</p>
            <button
              onClick={createNote}
              disabled={creating}
              className="rounded-xl bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-400 transition hover:bg-amber-200 disabled:opacity-40"
            >
              Create your first note
            </button>
          </div>
        )}
        {notes?.map(note => (
          <NoteRow
            key={note.id}
            note={note}
            active={note.id === active}
            onClick={() => selectNote(note.id)}
            onDelete={() => deleteNote(note.id)}
          />
        ))}
      </div>
    </div>
  );

  // ── Editor panel ────────────────────────────────────────────────────────────
  const editorPanel = activeNote ? (
    <NoteEditor
      key={activeNote.id}
      note={activeNote}
      onBack={() => setMobileView('list')}
      onSaved={handleSaved}
    />
  ) : (
    <EmptyEditor />
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  // Desktop: always two-pane. Mobile: toggle between panes.
  return (
    <div
      className="fixed inset-0 md:left-56 flex flex-col bg-white dark:bg-neutral-900"
      style={{ top: '57px' }} // below sticky header
    >
      {/* Desktop two-pane */}
      <div className="hidden md:grid md:grid-cols-[280px_1fr] h-full">
        <div className="h-full overflow-hidden">{listPanel}</div>
        <div className="h-full overflow-hidden">{editorPanel}</div>
      </div>

      {/* Mobile single-pane toggle */}
      <div className="flex flex-col h-full md:hidden">
        {mobileView === 'list' ? (
          <div className="h-full overflow-hidden">{listPanel}</div>
        ) : (
          <div className="h-full overflow-hidden">{editorPanel}</div>
        )}
      </div>
    </div>
  );
}
