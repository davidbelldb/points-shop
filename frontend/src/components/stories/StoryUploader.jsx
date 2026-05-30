import { useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import SliderSticker from './SliderSticker.jsx';
import SliderStickerConfig from './SliderStickerConfig.jsx';
import StickerDrawer from './StickerDrawer.jsx';
import TextSticker from './TextSticker.jsx';
import TextStickerConfig from './TextStickerConfig.jsx';

/* Modal sheet for adding a new story. iPhone's <input type="file"> with
   image/video/audio accept brings up the native picker — Photo Library,
   Take Photo, Choose File (for audio voice notes). The duration slider
   lets the poster control how long an IMAGE story stays on screen in the
   viewer (1–60s). For video/audio we use the file's natural duration. */
const DEFAULT_IMAGE_SECONDS = 5;
const MAX_SECONDS = 60;

export default function StoryUploader({ onClose, onPosted }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [caption, setCaption] = useState('');
  const [seconds, setSeconds] = useState(DEFAULT_IMAGE_SECONDS);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // Some iOS-recorded HEVC clips can't be decoded by the local <video>
  // element even though they upload + play fine after server-side handling.
  // We swap to a friendlier "ready to upload" tile when the element errors.
  const [previewBroken, setPreviewBroken] = useState(false);
  // Sticker editor state — for MVP we support a single slider sticker.
  // Position is the centre point of the sticker, expressed as % of the
  // preview container's width/height. Default sits low-centre.
  const [sticker, setSticker] = useState(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Floating text stickers — independent of the single slider sticker, so the
  // user can stack several lines of text plus an optional slider. textEditor
  // holds which one is being edited ({ index } where index === null = new).
  const [textStickers, setTextStickers] = useState([]);
  const [textEditor, setTextEditor] = useState(null);
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const textDragMovedRef = useRef(false);

  // Best-effort local detection — used so the duration slider only shows
  // for image stories (videos/audio play for their natural length).
  const fileKind = (() => {
    if (!file) return null;
    if (file.type?.startsWith('image/')) return 'image';
    if (file.type?.startsWith('video/')) return 'video';
    if (file.type?.startsWith('audio/')) return 'audio';
    const ext = file.name?.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? '';
    if (['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image';
    if (['mov', 'mp4', 'm4v', 'webm', 'qt', 'hevc'].includes(ext)) return 'video';
    if (['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga'].includes(ext)) return 'audio';
    return null;
  })();

  function chooseFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setPreviewBroken(false);
  }

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null); setPreviewUrl(null);
    setPreviewBroken(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  // Human-friendly file size for the fallback tile.
  function prettySize(n) {
    if (!Number.isFinite(n)) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`;
  }

  /* Sticker drag — pointer-event based so it works on touch + mouse.
     We capture the pointer, then translate every move into a delta on
     the preview container's bounding box, clamping to a sensible
     in-frame range so the sticker can't be dragged off-screen. */
  function onStickerPointerDown(e) {
    if (!stageRef.current || !sticker) return;
    e.stopPropagation();
    const rect = stageRef.current.getBoundingClientRect();
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      originalX: sticker.x,
      originalY: sticker.y,
      width: rect.width,
      height: rect.height,
    };
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* noop */ }
  }
  function onStickerPointerMove(e) {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    const dx = ((e.clientX - d.startClientX) / d.width) * 100;
    const dy = ((e.clientY - d.startClientY) / d.height) * 100;
    setSticker((s) => s ? {
      ...s,
      x: Math.max(15, Math.min(85, d.originalX + dx)),
      y: Math.max(12, Math.min(88, d.originalY + dy)),
    } : s);
  }
  function onStickerPointerUp(e) {
    if (dragRef.current) e.stopPropagation();
    dragRef.current = null;
  }

  /* Text-sticker drag — same model as the slider but keyed to an index so
     each text line moves independently. textDragMovedRef lets the trailing
     click skip opening the editor when the gesture was actually a drag. */
  function onTextPointerDown(e, index) {
    if (!stageRef.current) return;
    e.stopPropagation();
    const rect = stageRef.current.getBoundingClientRect();
    const t = textStickers[index];
    textDragMovedRef.current = false;
    dragRef.current = {
      kind: 'text',
      index,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originalX: t.x,
      originalY: t.y,
      width: rect.width,
      height: rect.height,
    };
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* noop */ }
  }
  function onTextPointerMove(e) {
    const d = dragRef.current;
    if (!d || d.kind !== 'text') return;
    e.stopPropagation();
    const dx = ((e.clientX - d.startClientX) / d.width) * 100;
    const dy = ((e.clientY - d.startClientY) / d.height) * 100;
    if (Math.abs(e.clientX - d.startClientX) > 3 || Math.abs(e.clientY - d.startClientY) > 3) {
      textDragMovedRef.current = true;
    }
    setTextStickers((arr) => arr.map((s, i) => i === d.index ? {
      ...s,
      x: Math.max(8, Math.min(92, d.originalX + dx)),
      y: Math.max(8, Math.min(92, d.originalY + dy)),
    } : s));
  }
  function onTextPointerUp(e) {
    if (dragRef.current?.kind === 'text') e.stopPropagation();
    dragRef.current = null;
  }

  // Drawer → Text: always open a fresh editor for a new line.
  function pickTextFromDrawer() {
    setDrawerOpen(false);
    setTextEditor({ index: null });
  }
  function saveText(next) {
    const clean = { ...next, type: 'text' };
    if (!clean.text || !clean.text.trim()) { // empty = treat as remove/cancel
      if (textEditor?.index != null) removeText(textEditor.index);
      setTextEditor(null);
      return;
    }
    clean.text = clean.text.trim();
    setTextStickers((arr) => {
      if (textEditor?.index == null) return [...arr, clean];
      return arr.map((s, i) => i === textEditor.index ? { ...s, ...clean } : s);
    });
    setTextEditor(null);
  }
  function removeText(index) {
    setTextStickers((arr) => arr.filter((_, i) => i !== index));
    setTextEditor(null);
  }

  // Drawer → Slider: if there's an existing slider, open its config for
  // edit; otherwise create one with sensible defaults and open the config.
  function pickSliderFromDrawer() {
    setDrawerOpen(false);
    if (!sticker) {
      setSticker({
        type: 'slider',
        x: 50, y: 70,
        prompt: '',
        start_label: '',
        end_label: '',
        emoji_stages: ['💩', '🤡', '😎', '😍'],
      });
    }
    setConfigOpen(true);
  }

  async function post() {
    if (!file || busy) return;
    setBusy(true); setErr(null);
    try {
      const { url, type, thumbnail_url } = await api.upload(file);
      if (type !== 'image' && type !== 'video' && type !== 'audio') {
        throw new Error('Only photos, short videos, or voice notes can be posted as stories.');
      }
      // Only persist the duration for image stories — video/audio play for
      // their natural length anyway. (Backend clamps 1..60 too.)
      const payload = {
        media_url: url,
        media_type: type,
        caption: caption.trim() || null,
      };
      if (type === 'image') payload.duration_seconds = seconds;
      if (type === 'video' && thumbnail_url) payload.thumbnail_url = thumbnail_url;
      const allStickers = [...(sticker ? [sticker] : []), ...textStickers];
      if (allStickers.length) payload.stickers = allStickers.slice(0, 6);
      await api.createStory(payload);
      onPosted?.();
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex h-full w-full max-w-md flex-col bg-white sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <button onClick={onClose} className="text-sm text-neutral-500">Cancel</button>
          <span className="text-sm font-semibold">New sneaky story</span>
          <button onClick={post} disabled={!file || busy} className="text-sm font-semibold text-amber-700 disabled:opacity-40">
            {busy ? 'Posting…' : 'Post'}
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {!file ? (
            <label className="flex aspect-[9/12] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 text-amber-700">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="6" width="18" height="13" rx="2" />
                <circle cx="12" cy="13" r="3.5" />
                <path d="M8 6l1.5-2h5L16 6" />
              </svg>
              <span className="text-sm font-semibold">Photo, video, or voice note</span>
              <span className="text-xs text-neutral-500">Up to 50MB · 24 hours live</span>
              {/* iOS Files greys out audio with only `audio/*`, and HEIC/MOV
                  with only `image/*` and `video/*`. Spelling out the explicit
                  mimetypes AND extensions covers all the iOS file-pickers. */}
              <input
                ref={fileRef}
                type="file"
                accept={[
                  'image/*', 'video/*', 'audio/*',
                  'image/heic', 'image/heif',
                  'video/quicktime', 'video/mp4', 'video/x-m4v', 'video/webm',
                  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a',
                  'audio/m4a', 'audio/aac', 'audio/x-aac',
                  'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm',
                  '.heic', '.heif', '.mov', '.mp4', '.m4v', '.webm', '.hevc',
                  '.mp3', '.m4a', '.aac', '.wav', '.ogg', '.oga',
                ].join(',')}
                onChange={chooseFile}
                className="hidden"
              />
            </label>
          ) : (
            <div className="space-y-2">
              <div ref={stageRef} className="relative aspect-[9/12] overflow-hidden rounded-2xl bg-black">
                {fileKind === 'video' ? (
                  previewBroken ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-white">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-white/80">
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" />
                      </svg>
                      <p className="text-sm font-semibold">Ready to upload</p>
                      <p className="text-xs text-white/70">
                        Your phone recorded this in a codec the browser can't preview here (usually HEVC).
                      </p>
                      <p className="text-[11px] text-white/50">{file.name} · {prettySize(file.size)}</p>
                    </div>
                  ) : (
                    <video
                      src={previewUrl}
                      className="h-full w-full object-contain"
                      controls
                      playsInline
                      onError={() => setPreviewBroken(true)}
                    />
                  )
                ) : fileKind === 'audio' ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white">
                    <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                      <line x1="8" y1="22" x2="16" y2="22" />
                    </svg>
                    <p className="text-xs text-white/70">Voice note</p>
                    <audio src={previewUrl} controls className="w-3/4" />
                  </div>
                ) : (
                  <img src={previewUrl} alt="" className="h-full w-full object-contain" />
                )}

                {/* Sticker overlay — absolutely positioned at the sticker's
                    (x%, y%). Pointer events bound here for drag-to-move. */}
                {sticker && (
                  <div
                    className="absolute touch-none"
                    style={{
                      left: `${sticker.x}%`,
                      top: `${sticker.y}%`,
                      transform: 'translate(-50%, -50%)',
                      cursor: 'grab',
                    }}
                    onPointerDown={onStickerPointerDown}
                    onPointerMove={onStickerPointerMove}
                    onPointerUp={onStickerPointerUp}
                    onPointerCancel={onStickerPointerUp}
                    onClick={(e) => { e.stopPropagation(); setConfigOpen(true); }}
                  >
                    <SliderSticker sticker={sticker} mode="editor" />
                  </div>
                )}

                {/* Text stickers — each draggable + tappable to edit. */}
                {textStickers.map((t, i) => (
                  <div
                    key={i}
                    className="absolute touch-none"
                    style={{
                      left: `${t.x}%`,
                      top: `${t.y}%`,
                      transform: 'translate(-50%, -50%)',
                      cursor: 'grab',
                    }}
                    onPointerDown={(e) => onTextPointerDown(e, i)}
                    onPointerMove={onTextPointerMove}
                    onPointerUp={onTextPointerUp}
                    onPointerCancel={onTextPointerUp}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (textDragMovedRef.current) { textDragMovedRef.current = false; return; }
                      setTextEditor({ index: i });
                    }}
                  >
                    <TextSticker sticker={t} />
                  </div>
                ))}
              </div>

              <button onClick={clearFile} className="text-xs text-neutral-500 underline">
                Choose a different file
              </button>
            </div>
          )}

          {/* Display-length slider — only meaningful for image stories. */}
          {fileKind === 'image' && (
            <div>
              <div className="flex items-baseline justify-between">
                <label className="text-xs font-semibold text-neutral-500">Show for</label>
                <span className="text-xs font-semibold text-amber-700 tabular-nums">{seconds}s</span>
              </div>
              <input
                type="range"
                min={1}
                max={MAX_SECONDS}
                step={1}
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
                className="mt-1 block w-full accent-amber-500"
              />
              <p className="mt-0.5 text-[11px] text-neutral-400">
                How long this still image plays before auto-advancing. Up to a minute.
              </p>
            </div>
          )}

          {/* Sticker drawer entry — sits between the duration setter and the
              caption, deliberately as a wide button bar so it reads as a
              first-class action rather than a secondary pill. */}
          {file && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 transition active:scale-[0.99]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span>Add stickers</span>
              {(sticker ? 1 : 0) + textStickers.length > 0 && (
                <span className="ml-1 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                  {(sticker ? 1 : 0) + textStickers.length} added
                </span>
              )}
            </button>
          )}

          <div>
            <label className="text-xs font-semibold text-neutral-500">Caption (optional)</label>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={140}
              placeholder="Say something…"
              className="mt-1 block w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      </div>

      {configOpen && sticker && (
        <SliderStickerConfig
          initial={sticker}
          onCancel={() => setConfigOpen(false)}
          onSave={(next) => { setSticker((prev) => ({ ...(prev ?? {}), ...next })); setConfigOpen(false); }}
          onDelete={() => { setSticker(null); setConfigOpen(false); }}
        />
      )}

      {drawerOpen && (
        <StickerDrawer
          hasSlider={!!sticker}
          textCount={textStickers.length}
          onPickSlider={pickSliderFromDrawer}
          onPickText={pickTextFromDrawer}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {textEditor && (
        <TextStickerConfig
          initial={textEditor.index != null ? textStickers[textEditor.index] : null}
          onCancel={() => setTextEditor(null)}
          onSave={saveText}
          onDelete={textEditor.index != null ? () => removeText(textEditor.index) : undefined}
        />
      )}
    </div>
  );
}
