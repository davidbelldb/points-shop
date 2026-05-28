import { useRef, useState } from 'react';
import { api } from '../../lib/api.js';

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
  }

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null); setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function post() {
    if (!file || busy) return;
    setBusy(true); setErr(null);
    try {
      const { url, type } = await api.upload(file);
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
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*,audio/*"
                onChange={chooseFile}
                className="hidden"
              />
            </label>
          ) : (
            <div className="space-y-2">
              <div className="aspect-[9/12] overflow-hidden rounded-2xl bg-black">
                {fileKind === 'video' ? (
                  <video src={previewUrl} className="h-full w-full object-contain" controls playsInline />
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
    </div>
  );
}
