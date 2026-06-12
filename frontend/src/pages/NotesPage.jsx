/**
 * Sneaky Notes — Apple Notes-style private note-taking.
 * v2: personal + shared notes, archive, trash (30-day auto-purge), iOS swipe.
 *
 * Layout:
 *   Mobile  : single-pane toggle  (list → editor with back button)
 *   Desktop : persistent two-pane (280 px list | full editor)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import TipTapLink from '@tiptap/extension-link';
import TipTapImage from '@tiptap/extension-image';

// ─── Indent extension ─────────────────────────────────────────────────────────
// Apple-Notes-style indentation for plain paragraphs and headings (lists keep
// using sink/lift). Stored as an `indent` attr rendered as margin-left, so it
// round-trips through the saved HTML. Tab / Shift-Tab work too.
const INDENT_STEP = 24; // px per level
const Indent = Extension.create({
  name: 'indent',

  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        indent: {
          default: 0,
          parseHTML: (el) => {
            const ml = parseInt(el.style?.marginLeft || '0', 10);
            return Number.isFinite(ml) && ml > 0 ? Math.round(ml / INDENT_STEP) : 0;
          },
          renderHTML: (attrs) =>
            attrs.indent ? { style: `margin-left: ${attrs.indent * INDENT_STEP}px` } : {},
        },
      },
    }];
  },

  addCommands() {
    const apply = (delta) => ({ tr, state, dispatch }) => {
      const { from, to } = state.selection;
      let changed = false;
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name === 'paragraph' || node.type.name === 'heading') {
          // Skip blocks living inside list items — lists indent via sink/lift.
          const $pos = state.doc.resolve(pos);
          for (let d = $pos.depth; d > 0; d--) {
            const parent = $pos.node(d).type.name;
            if (parent === 'listItem' || parent === 'taskItem') return;
          }
          const cur = node.attrs.indent || 0;
          const next = Math.max(0, Math.min(8, cur + delta));
          if (next !== cur) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
            changed = true;
          }
        }
      });
      if (changed && dispatch) dispatch(tr);
      return changed;
    };
    return {
      indentBlock:  () => apply(1),
      outdentBlock: () => apply(-1),
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const e = this.editor;
        if (e.isActive('taskItem')) return e.chain().focus().sinkListItem('taskItem').run() || true;
        if (e.isActive('listItem')) return e.chain().focus().sinkListItem('listItem').run() || true;
        return e.chain().focus().indentBlock().run() || true; // swallow Tab either way
      },
      'Shift-Tab': () => {
        const e = this.editor;
        if (e.isActive('taskItem')) return e.chain().focus().liftListItem('taskItem').run() || true;
        if (e.isActive('listItem')) return e.chain().focus().liftListItem('listItem').run() || true;
        return e.chain().focus().outdentBlock().run() || true;
      },
    };
  },
});
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

/** Strip HTML tags + entities for list preview text. */
function stripHtml(html) {
  return (html ?? '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

/** Split stored body into title (first line) and rich HTML body (rest). */
function splitBody(raw) {
  const nl = (raw ?? '').indexOf('\n');
  if (nl === -1) return { title: raw ?? '', bodyHtml: '' };
  return { title: raw.slice(0, nl), bodyHtml: raw.slice(nl + 1) };
}

/**
 * Convert old plain-text notes to HTML paragraphs for Tiptap.
 * HTML notes (start with '<') are returned unchanged.
 */
function toHtml(raw) {
  if (!raw) return '';
  if (raw.trimStart().startsWith('<')) return raw;
  return raw.split('\n').map(l =>
    `<p>${l ? l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''}</p>`
  ).join('');
}

function parseNote(note) {
  const { title, bodyHtml } = splitBody(note.body ?? '');
  return { title, preview: stripHtml(bodyHtml) };
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

  // iOS Safari compositing-layer fix: overflow-hidden + transform = buttons bleed through.
  // Instead, use clip-path on the buttons to hide them when not swiped.
  // clip from left: TOTAL_W when hidden (offset=0), 0 when fully revealed (offset=-TOTAL_W).
  const clipLeft = Math.max(0, TOTAL_W + offset);
  const animating = startX.current === null;

  return (
    <div
      ref={containerRef}
      className="relative"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Action buttons — clipped via clip-path to avoid iOS compositing bleed-through */}
      <div
        className="md:hidden absolute right-0 top-0 bottom-0 flex rounded-r-xl"
        style={{
          width: TOTAL_W,
          clipPath: `inset(0 0 0 ${clipLeft}px)`,
          transition: animating ? 'clip-path 0.22s ease' : 'none',
        }}
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
      {/* Row content — slides left on swipe */}
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: animating ? 'transform 0.22s ease' : 'none',
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
          : 'hover:bg-neutral-100'
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
              className="rounded p-1 opacity-0 group-hover:opacity-100 transition-all text-neutral-400 dark:text-neutral-500 hover:text-[#fca5a5]"
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
              className="rounded p-1 opacity-0 group-hover:opacity-100 transition-all hover:text-[#fca5a5] text-neutral-400 dark:text-neutral-500"
              style={confirmHard ? { opacity: 1, background: '#3a1818', color: '#fca5a5' } : {}}
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
        rightAction={{ label: 'Delete',  bg: 'bg-[#3a1818]',   color: '#fca5a5', icon: <TrashIcon size={18} />,   onClick: onDelete  }}
      >{inner}</SwipeRow>
    );
  }
  if (mode === 'archive') {
    return (
      <SwipeRow
        leftAction={{ label: 'Restore', bg: 'bg-[#2a5a4f]',   color: '#61dbbb', icon: <RestoreIcon size={18} />, onClick: onRestore }}
        rightAction={{ label: 'Delete',  bg: 'bg-[#3a1818]',   color: '#fca5a5', icon: <TrashIcon size={18} />,   onClick: onDelete  }}
      >{inner}</SwipeRow>
    );
  }
  if (mode === 'trash') {
    return (
      <SwipeRow
        leftAction={{ label: 'Restore', bg: 'bg-[#2a5a4f]',   color: '#61dbbb', icon: <RestoreIcon size={18} />, onClick: onRestore    }}
        rightAction={{ label: 'Delete',  bg: 'bg-[#3a1818]',   color: '#fca5a5', icon: <TrashIcon size={18} />,   onClick: onHardDelete }}
      >{inner}</SwipeRow>
    );
  }
  return inner;
}

// ─── Note Toolbar ─────────────────────────────────────────────────────────────

function NoteToolbar({ editor }) {
  const [showStyles, setShowStyles] = useState(false);
  const [trayOpen, setTrayOpen]     = useState(false);
  const fileRef = useRef(null);
  if (!editor) return null;

  const toggleTray = () => {
    setTrayOpen((open) => {
      if (open) setShowStyles(false); // closing — collapse sub-panels too
      return !open;
    });
  };

  const Btn = ({ active, onMd, title: t, children }) => (
    <button
      onMouseDown={onMd}
      title={t}
      className={`notes-tb-btn${active ? ' notes-tb-active' : ''}`}
    >
      {children}
    </button>
  );

  const activeStyle = editor.isActive('heading', { level: 1 }) ? 'Title'
    : editor.isActive('heading', { level: 2 }) ? 'Heading'
    : editor.isActive('heading', { level: 3 }) ? 'Subheading'
    : 'Body';

  const STYLES = [
    { label: 'Title',      labelCls: 'text-lg font-bold',     run: () => editor.chain().focus().setHeading({ level: 1 }).run() },
    { label: 'Heading',    labelCls: 'text-base font-bold',   run: () => editor.chain().focus().setHeading({ level: 2 }).run() },
    { label: 'Subheading', labelCls: 'text-sm font-semibold', run: () => editor.chain().focus().setHeading({ level: 3 }).run() },
    { label: 'Body',       labelCls: 'text-sm',               run: () => editor.chain().focus().setParagraph().run() },
  ];

  function indent() {
    if (editor.isActive('taskList')) editor.chain().focus().sinkListItem('taskItem').run();
    else if (editor.isActive('bulletList') || editor.isActive('orderedList')) editor.chain().focus().sinkListItem('listItem').run();
    else editor.chain().focus().indentBlock().run(); // plain paragraphs/headings
  }
  function outdent() {
    if (editor.isActive('taskList')) editor.chain().focus().liftListItem('taskItem').run();
    else if (editor.isActive('bulletList') || editor.isActive('orderedList')) editor.chain().focus().liftListItem('listItem').run();
    else editor.chain().focus().outdentBlock().run();
  }

  // ── Link dialog — Title + URL together (window.prompt chains are unreliable
  // and the second prompt can be silently suppressed by the browser) ─────────
  const [linkDlg, setLinkDlg] = useState(null); // { url, title, selectedText } | null

  function openLinkDialog() {
    const prevHref = editor.getAttributes('link').href || '';
    const { from, to, empty } = editor.state.selection;
    const selectedText = empty ? '' : editor.state.doc.textBetween(from, to, ' ');
    setLinkDlg({ url: prevHref || 'https://', title: selectedText, selectedText });
  }

  function saveLink() {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const dlg = linkDlg;
    setLinkDlg(null);
    if (!dlg) return;

    const url = dlg.url.trim();
    if (!url || url === 'https://') return;
    const href = /^(https?:\/\/|mailto:|tel:)/i.test(url) ? url : `https://${url}`;
    const cleanTitle = dlg.title.trim();

    const { empty } = editor.state.selection;
    if (editor.isActive('link') || !empty) {
      // Editing an existing link, or linking selected text.
      if (cleanTitle && cleanTitle !== dlg.selectedText) {
        editor.chain().focus().extendMarkRange('link')
          .insertContent(`<a href="${esc(href)}">${esc(cleanTitle)}</a>`)
          .run();
      } else {
        editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
      }
    } else {
      // Nothing selected — insert a fresh titled link (URL hidden behind it)
      const text = cleanTitle || href.replace(/^https?:\/\//i, '');
      editor.chain().focus()
        .insertContent(`<a href="${esc(href)}">${esc(text)}</a>&nbsp;`)
        .run();
    }
  }

  function removeLink() {
    setLinkDlg(null);
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
  }

  async function pickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { url } = await api.upload(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      alert(`Image upload failed: ${err.message}`);
    }
  }

  /* 3 × 4 grid — 12 cells */
  const ROW_DIVIDER = <div className="notes-tb-row-break" />;

  return (
    <div className="notes-toolbar relative select-none">
      {/* Link dialog — title + URL */}
      {linkDlg && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setLinkDlg(null)} />
          <div className="notes-styles-panel absolute bottom-full left-0 right-0 z-50 space-y-3 p-4 shadow-xl">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Title</span>
              <input
                value={linkDlg.title}
                onChange={(e) => setLinkDlg((d) => ({ ...d, title: e.target.value }))}
                placeholder="Text shown instead of the URL"
                autoFocus
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">URL</span>
              <input
                value={linkDlg.url}
                onChange={(e) => setLinkDlg((d) => ({ ...d, url: e.target.value }))}
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck="false"
                placeholder="https://"
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none"
              />
            </label>
            <div className="flex items-center justify-end gap-2 pt-1">
              {editor.isActive('link') && (
                <button
                  onClick={removeLink}
                  className="mr-auto rounded-lg px-3 py-2 text-sm font-semibold text-red-700"
                >
                  Remove
                </button>
              )}
              <button onClick={() => setLinkDlg(null)} className="rounded-lg px-3 py-2 text-sm text-neutral-500">
                Cancel
              </button>
              <button
                onClick={saveLink}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-amber-950"
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}

      {/* Text-style dropdown */}
      {showStyles && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setShowStyles(false)} />
          <div className="notes-styles-panel absolute bottom-full left-0 right-0 z-50 shadow-xl">
            {STYLES.map(({ label, labelCls, run }) => (
              <button
                key={label}
                onMouseDown={(e) => { e.preventDefault(); run(); setShowStyles(false); }}
                className={`notes-style-item flex w-full items-baseline justify-between px-5 py-2.5 text-left transition-colors${label === activeStyle ? ' notes-style-active' : ''}`}
              >
                <span className={labelCls}>{label}</span>
                {label === activeStyle && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Collapsible tray — the full formatting grid slides open/closed */}
      <div
        className="overflow-hidden transition-all duration-200 ease-out"
        style={{ maxHeight: trayOpen ? 260 : 0, opacity: trayOpen ? 1 : 0 }}
      >
      <div className="notes-tb-grid">
        {/* ── Row 1: Text style · Bold · Italic · Underline ── */}
        <Btn active={showStyles} onMd={(e) => { e.preventDefault(); setShowStyles(v => !v); }} title="Text style">
          <span className="text-[15px] font-bold tracking-tight">Aa</span>
        </Btn>
        <Btn active={editor.isActive('bold')} onMd={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }} title="Bold">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h8a4 4 0 0 1 0 8H6V4zM6 12h9a4 4 0 0 1 0 8H6V12z" /></svg>
        </Btn>
        <Btn active={editor.isActive('italic')} onMd={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }} title="Italic">
          <svg width="20" height="22" viewBox="0 0 22 24" fill="currentColor"><path d="M10 4h6M6 20h6M14 4 8 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /></svg>
        </Btn>
        <Btn active={editor.isActive('underline')} onMd={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }} title="Underline">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 4v6a6 6 0 0 0 12 0V4" /><line x1="4" y1="22" x2="20" y2="22" /></svg>
        </Btn>

        {ROW_DIVIDER}

        {/* ── Row 2: Strikethrough · Highlight · Checklist · Bullet ── */}
        <Btn active={editor.isActive('strike')} onMd={(e) => { e.preventDefault(); editor.chain().focus().toggleStrike().run(); }} title="Strikethrough">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /><path d="M16 6c0 0-1-2-4-2s-4.5 1.5-4.5 3.5C7.5 10 9.5 11 12 12" /><path d="M8 18c0 0 1 2 4 2s4.5-1.5 4.5-3.5C16.5 14.5 15 13 12 12" /></svg>
        </Btn>
        <Btn active={editor.isActive('highlight')} onMd={(e) => { e.preventDefault(); editor.chain().focus().toggleHighlight().run(); }} title="Highlight">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
        </Btn>
        <Btn active={editor.isActive('taskList')} onMd={(e) => { e.preventDefault(); editor.chain().focus().toggleTaskList().run(); }} title="Checklist">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
        </Btn>
        <Btn active={editor.isActive('bulletList')} onMd={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }} title="Bullet list">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="4" cy="6" r="2" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="2" fill="currentColor" stroke="none" />
            <line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" />
          </svg>
        </Btn>

        {ROW_DIVIDER}

        {/* ── Row 3: Numbered · Outdent · Indent · Clear ── */}
        <Btn active={editor.isActive('orderedList')} onMd={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }} title="Numbered list">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="10" y1="6" x2="20" y2="6" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="10" y1="18" x2="20" y2="18" />
            <text x="1.5" y="8.5" fontSize="8" fill="currentColor" stroke="none" fontWeight="700">1</text>
            <text x="1.5" y="14.5" fontSize="8" fill="currentColor" stroke="none" fontWeight="700">2</text>
            <text x="1.5" y="20.5" fontSize="8" fill="currentColor" stroke="none" fontWeight="700">3</text>
          </svg>
        </Btn>
        <Btn active={false} onMd={(e) => { e.preventDefault(); outdent(); }} title="Decrease indent">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="21" y1="10" x2="7" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="7" y2="18" />
            <polyline points="11 7 8 10 11 13" />
          </svg>
        </Btn>
        <Btn active={false} onMd={(e) => { e.preventDefault(); indent(); }} title="Increase indent">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="21" y1="10" x2="7" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="21" y1="18" x2="7" y2="18" />
            <polyline points="7 7 10 10 7 13" />
          </svg>
        </Btn>
        <Btn active={false} onMd={(e) => { e.preventDefault(); editor.chain().focus().unsetAllMarks().clearNodes().run(); }} title="Clear formatting">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 1.397.009l2.596 2.595a1 1 0 0 1 .009 1.397L8.059 19.39a1 1 0 0 1-.728.312H4.586a1 1 0 0 1-.707-1.707z"/>
            <line x1="3" y1="3" x2="21" y2="21"/>
          </svg>
        </Btn>

        {ROW_DIVIDER}

        {/* ── Row 4: Link · Image ── */}
        <Btn active={editor.isActive('link')} onMd={(e) => { e.preventDefault(); openLinkDialog(); }} title="Link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </Btn>
        <Btn active={false} onMd={(e) => { e.preventDefault(); fileRef.current?.click(); }} title="Insert image">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </Btn>
        <span />
        <span />
      </div>
      </div>{/* end collapsible tray */}

      {/* Tray handle — toggles the formatting tools open/closed */}
      <button
        onMouseDown={(e) => { e.preventDefault(); toggleTray(); }}
        title={trayOpen ? 'Hide formatting' : 'Show formatting'}
        className={`notes-tb-btn flex w-full items-center justify-center gap-2 ${trayOpen ? 'notes-tb-active' : ''}`}
        style={{ height: 40, borderTop: trayOpen ? '1px solid var(--color-neutral-200, #e5e5e3)' : 'none' }}
      >
        <span className="text-[15px] font-bold tracking-tight">Aa</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: 'transform 200ms ease', transform: trayOpen ? 'rotate(180deg)' : 'none' }}
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      {/* Hidden file input for image inserts */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
    </div>
  );
}

// ─── Note Editor ──────────────────────────────────────────────────────────────

function NoteEditor({ note, onBack, onSaved, onTypeChanged, readOnly }) {
  const titleRef   = useRef(null);
  const saveTimer  = useRef(null);
  const latestHtml = useRef('');

  const { title: initTitle, bodyHtml: initBodyHtml } = splitBody(note.body ?? '');
  const initHtml = toHtml(initBodyHtml);

  const [title,      setTitle]      = useState(initTitle);
  const [saving,     setSaving]     = useState(false);
  const [savedAt,    setSavedAt]    = useState(null);
  const [converting, setConverting] = useState(false);

  // Callback ref so onUpdate always captures the latest title without stale closure
  const onUpdateRef = useRef(null);

  latestHtml.current = initHtml;

  const resizeTitle = useCallback(() => {
    if (!titleRef.current) return;
    titleRef.current.style.height = 'auto';
    titleRef.current.style.height = titleRef.current.scrollHeight + 'px';
  }, []);
  useEffect(() => { resizeTitle(); }, [title, resizeTitle]);

  const scheduleSave = useCallback((newTitle, newHtml) => {
    const combined = newTitle + (newHtml ? '\n' + newHtml : '');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const saved = await api.updateNote(note.id, combined);
        onSaved(saved);
        setSavedAt(new Date());
      } catch (e) {
        console.error('Auto-save failed', e);
      } finally {
        setSaving(false);
      }
    }, 800);
  }, [note.id, onSaved]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Underline,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      // openOnClick: links navigate on press even while editing (opens new tab)
      TipTapLink.configure({ openOnClick: true, autolink: true, linkOnPaste: true }),
      TipTapImage,
      Indent,
    ],
    content: initHtml,
    editable: !readOnly,
    // Delegate to a ref so we always capture the latest title without stale closure
    onUpdate: ({ editor: ed }) => onUpdateRef.current?.(ed),
  });

  // Keep onUpdateRef pointing at the latest title + scheduleSave
  onUpdateRef.current = (ed) => {
    const html = ed.getHTML();
    latestHtml.current = html;
    scheduleSave(title, html);
  };

  // Focus title on new blank note
  useEffect(() => {
    if (!note.body) titleRef.current?.focus();
  }, [note.id, note.body]);

  // Cleanup save timer on unmount
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#1c1c1e]">
      {/* Mobile back bar */}
      {onBack && (
        <div className="flex items-center gap-2 border-b border-neutral-200 px-3 pt-5 pb-2.5 md:hidden">
          <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
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

        {/* Shared badge / Share button */}
        <div className="mb-5 flex justify-center">
          {note.type === 'shared' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#61dbbb]/15 dark:bg-[#61dbbb]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#1f8a6b] dark:text-[#61dbbb]">
              <SharedPeopleIcon size={11} /> Shared note
            </span>
          ) : !readOnly && (
            <button
              onClick={async () => {
                if (converting) return;
                setConverting(true);
                try {
                  const updated = await api.changeNoteType(note.id, 'shared');
                  onTypeChanged(updated);
                } catch { /* silent */ } finally {
                  setConverting(false);
                }
              }}
              disabled={converting}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#61dbbb]/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#61dbbb]/60 transition hover:border-[#61dbbb] hover:text-[#61dbbb] active:scale-95 disabled:opacity-40"
            >
              <SharedPeopleIcon size={11} />
              {converting ? 'Sharing…' : 'Share with Katie'}
            </button>
          )}
        </div>

        {/* Title */}
        {readOnly ? (
          <>
            <h1 className="mb-3 text-2xl font-bold leading-snug text-neutral-900 dark:text-white">
              {initTitle || <span className="italic text-neutral-300 dark:text-neutral-600">Untitled</span>}
            </h1>
            {/* Read-only rich content */}
            <div
              className="notes-content-ro"
              dangerouslySetInnerHTML={{ __html: initHtml }}
            />
          </>
        ) : (
          <>
            <textarea
              ref={titleRef}
              value={title}
              onChange={(e) => {
                const v = e.target.value.replace(/\n/g, '');
                setTitle(v);
                // latestHtml.current always holds the latest editor HTML
                scheduleSave(v, editor ? editor.getHTML() : latestHtml.current);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  editor?.commands.focus();
                }
              }}
              placeholder="Title"
              rows={1}
              className="w-full resize-none overflow-hidden bg-transparent text-2xl font-bold leading-snug text-neutral-900 dark:text-white placeholder:text-neutral-300 dark:placeholder:text-neutral-700 focus:outline-none"
            />
            {/* Tiptap rich editor */}
            <div className="notes-content">
              <EditorContent editor={editor} />
            </div>
          </>
        )}
      </div>

      {/* Apple Notes-style format toolbar — only when editing */}
      {!readOnly && <NoteToolbar editor={editor} />}
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
    <div className="absolute top-full right-0 mt-1.5 z-50 w-48 rounded-2xl bg-white shadow-2xl ring-1 ring-black/8 dark:ring-white/8 overflow-hidden py-1">
      <button
        onClick={() => { onCreate('personal'); onClose(); }}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
      >
        <PersonIcon size={14} /> Personal note
      </button>
      <div className="mx-3 h-px bg-neutral-100" />
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

  // Poll for new/updated notes every 5 s (matches messages cadence).
  // Silent — doesn't reset active selection or show loading states.
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const fresh = await api.listNotes(API_STATUS[view]);
        setNotes(fresh);
      } catch { /* ignore poll errors */ }
    }, 5000);
    return () => clearInterval(poll);
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
    <div className="flex h-full flex-col bg-neutral-50 dark:bg-[#1c1c1e] border-r border-neutral-200">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 pt-5 pb-3 border-b border-neutral-200">
        {view !== 'active' ? (
          <button
            onClick={() => setView('active')}
            className="flex items-center gap-1 text-sm font-medium text-neutral-500 dark:text-neutral-400"
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
                  <div className="my-1.5 mx-3 h-px bg-neutral-200" />
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
        <div className="flex gap-1 border-t border-neutral-200 p-2">
          <button
            onClick={() => setView('archive')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 transition-colors"
          >
            <ArchiveIcon size={12} />
            Archive
            {footerCounts.archive > 0 && (
              <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-neutral-600 dark:text-neutral-300">
                {footerCounts.archive}
              </span>
            )}
          </button>
          <div className="my-1 w-px bg-neutral-200" />
          <button
            onClick={() => setView('trash')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 transition-colors"
          >
            <TrashIcon size={12} />
            Deleted
            {footerCounts.trash > 0 && (
              <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-neutral-600 dark:text-neutral-300">
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
      onTypeChanged={handleSaved}
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
