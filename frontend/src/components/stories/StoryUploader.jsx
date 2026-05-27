import { useRef, useState } from 'react';
import { api } from '../../lib/api.js';

/* Modal sheet for adding a new story. iPhone's <input type="file"> with
   image/video accept brings up the native "Photo Library / Take Photo /
   Choose File" picker — no in-app camera needed for MVP. */
export default function StoryUploader({ onClose, onPosted }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

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
      const { url, type } = await api.admin.upload(file);
      if (type !== 'image' && type !== 'video') {
        throw new Error('Only photos and short videos can be posted as stories.');
      }
      await api.createStory({
        media_url: url,
        media_type: type,
        caption: caption.trim() || null,
      });
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
              <span className="text-sm font-semibold">Choose photo or video</span>
              <span className="text-xs text-neutral-500">Up to 50MB · 24 hours live</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                onChange={chooseFile}
                className="hidden"
              />
            </label>
          ) : (
            <div className="space-y-2">
              <div className="aspect-[9/12] overflow-hidden rounded-2xl bg-black">
                {file.type.startsWith('video/') ? (
                  <video src={previewUrl} className="h-full w-full object-contain" controls playsInline />
                ) : (
                  <img src={previewUrl} alt="" className="h-full w-full object-contain" />
                )}
              </div>
              <button onClick={clearFile} className="text-xs text-neutral-500 underline">
                Choose a different file
              </button>
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
