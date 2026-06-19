import { useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock.js';
import SliderSticker from './SliderSticker.jsx';
import SliderStickerConfig from './SliderStickerConfig.jsx';
import StickerDrawer from './StickerDrawer.jsx';
import TextStickerConfig from './TextStickerConfig.jsx';
import PillStickerConfig from './PillStickerConfig.jsx';
import EmojiStickerPicker from './EmojiStickerPicker.jsx';
import GifStickerPicker from './GifStickerPicker.jsx';
import StickerContent from './StickerContent.jsx';
import DraggableSticker from './DraggableSticker.jsx';

/* Modal sheet for adding a new story. iPhone's <input type="file"> with
   image/video/audio accept brings up the native picker — Photo Library,
   Take Photo, Choose File (for audio voice notes). The duration slider
   lets the poster control how long an IMAGE story stays on screen in the
   viewer (1–60s). For video/audio we use the file's natural duration. */
const DEFAULT_IMAGE_SECONDS = 5;
const MAX_SECONDS = 60;

export default function StoryUploader({ onClose, onPosted }) {
  // Lock the feed behind this full-screen sheet so scroll gestures stay inside it.
  useBodyScrollLock();
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
  // Canvas stickers — every non-slider overlay (text, emoji, gif, location,
  // playing) lives in one array so they share drag/rotate/scale. The slider
  // sticker stays separate (it has its own interactive config + single slot).
  const [canvasStickers, setCanvasStickers] = useState([]);
  // Which canvas sticker (if any) has an open editor/picker. `index === null`
  // means "creating a new one"; otherwise the array index being edited.
  const [formEditor, setFormEditor] = useState(null);   // { kind:'text'|'location'|'playing', index }
  const [emojiPicker, setEmojiPicker] = useState(null); // { index }
  const [gifPicker, setGifPicker] = useState(null);     // { index }
  const stageRef = useRef(null);

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

  /* ===== Canvas sticker CRUD ===== */
  function updateCanvasSticker(index, patch) {
    setCanvasStickers((arr) => arr.map((s, i) => i === index ? { ...s, ...patch } : s));
  }
  function removeCanvasSticker(index) {
    setCanvasStickers((arr) => arr.filter((_, i) => i !== index));
  }
  function addCanvasSticker(obj) {
    setCanvasStickers((arr) => [...arr, { rot: 0, x: 50, y: 45, ...obj }]);
  }

  // Tapping a placed sticker re-opens the right editor/picker for its type.
  function openStickerEditor(index) {
    const s = canvasStickers[index];
    if (!s) return;
    if (s.type === 'emoji') setEmojiPicker({ index });
    else if (s.type === 'gif') setGifPicker({ index });
    else setFormEditor({ kind: s.type, index }); // text | location | playing
  }

  // Drawer entry points — open a fresh editor/picker for a new sticker.
  function pickFromDrawer(kind) {
    setDrawerOpen(false);
    if (kind === 'emoji') setEmojiPicker({ index: null });
    else if (kind === 'gif') setGifPicker({ index: null });
    else setFormEditor({ kind, index: null }); // text | location | playing
  }

  // Save handler for the form-based editors (text / location / playing).
  function saveForm(next) {
    const { kind, index } = formEditor ?? {};
    const clean = { ...next, type: kind };
    if (index == null) addCanvasSticker(clean);
    else updateCanvasSticker(index, clean);
    setFormEditor(null);
  }

  function chooseEmoji(em) {
    const { index } = emojiPicker ?? {};
    if (index == null) addCanvasSticker({ type: 'emoji', emoji: em, scale: 1 });
    else updateCanvasSticker(index, { emoji: em });
    setEmojiPicker(null);
  }

  function chooseGif(gif) {
    const { index } = gifPicker ?? {};
    if (index == null) addCanvasSticker({ type: 'gif', url: gif.url, aspect: gif.aspect, scale: 1 });
    else updateCanvasSticker(index, { url: gif.url, aspect: gif.aspect });
    setGifPicker(null);
  }

  // Drawer → Slider: if there's an existing slider, open its config for
  // edit; otherwise create one with sensible defaults and open the config.
  function pickSliderFromDrawer() {
    setDrawerOpen(false);
    if (!sticker) {
      setSticker({
        type: 'slider',
        x: 50, y: 70,
        rot: 0, scale: 1,
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
      const allStickers = [...(sticker ? [sticker] : []), ...canvasStickers];
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
    <div className="sheet-below-nav flex items-stretch justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl sm:h-auto sm:max-h-full sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <button onClick={onClose} className="text-sm text-neutral-500">Cancel</button>
          <span className="text-sm font-semibold">New sneaky story</span>
          <button onClick={post} disabled={!file || busy} className="text-sm font-semibold text-amber-700 disabled:opacity-40">
            {busy ? 'Posting…' : 'Post'}
          </button>
        </header>

        <div data-modal-scroll className="sheet-safe-bottom flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
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

                {/* Sticker overlay — drag to move, two-finger to rotate +
                    pinch-scale, tap to open config. */}
                {sticker && (
                  <DraggableSticker
                    sticker={sticker}
                    stageRef={stageRef}
                    allowScale={true}
                    onChange={(patch) => setSticker((s) => s ? { ...s, ...patch } : s)}
                    onTap={() => setConfigOpen(true)}
                  >
                    <SliderSticker sticker={sticker} mode="editor" />
                  </DraggableSticker>
                )}

                {/* Canvas stickers — drag to move, two-finger to rotate
                    (and pinch-scale emoji/gif), tap to edit. */}
                {canvasStickers.map((s, i) => (
                  <DraggableSticker
                    key={i}
                    sticker={s}
                    stageRef={stageRef}
                    allowScale={true}
                    onChange={(patch) => updateCanvasSticker(i, patch)}
                    onTap={() => openStickerEditor(i)}
                  >
                    <StickerContent sticker={s} />
                  </DraggableSticker>
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
              {(sticker ? 1 : 0) + canvasStickers.length > 0 && (
                <span className="ml-1 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                  {(sticker ? 1 : 0) + canvasStickers.length} added
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
          onPickSlider={pickSliderFromDrawer}
          onPick={pickFromDrawer}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {formEditor?.kind === 'text' && (
        <TextStickerConfig
          initial={formEditor.index != null ? canvasStickers[formEditor.index] : null}
          onCancel={() => setFormEditor(null)}
          onSave={saveForm}
          onDelete={formEditor.index != null ? () => { removeCanvasSticker(formEditor.index); setFormEditor(null); } : undefined}
        />
      )}

      {(formEditor?.kind === 'location' || formEditor?.kind === 'playing') && (
        <PillStickerConfig
          kind={formEditor.kind}
          initial={formEditor.index != null ? canvasStickers[formEditor.index] : null}
          onCancel={() => setFormEditor(null)}
          onSave={saveForm}
          onDelete={formEditor.index != null ? () => { removeCanvasSticker(formEditor.index); setFormEditor(null); } : undefined}
        />
      )}

      {emojiPicker && (
        <EmojiStickerPicker
          onSelect={chooseEmoji}
          onClose={() => setEmojiPicker(null)}
          onRemove={emojiPicker.index != null ? () => { removeCanvasSticker(emojiPicker.index); setEmojiPicker(null); } : undefined}
        />
      )}

      {gifPicker && (
        <GifStickerPicker
          onSelect={chooseGif}
          onClose={() => setGifPicker(null)}
          onRemove={gifPicker.index != null ? () => { removeCanvasSticker(gifPicker.index); setGifPicker(null); } : undefined}
        />
      )}
    </div>
  );
}
