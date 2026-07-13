import { useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { buildLayout } from '../lib/crosswordLayout.js';

const PINK = '#ee70bd';

// Words for the dropdown, labelled by clue number + direction + answer.
function wordOptions(words) {
  const L = buildLayout(words);
  return [...L.across, ...L.down]
    .sort((a, b) => a.number - b.number || (a.direction < b.direction ? -1 : 1))
    .map((e) => ({ wordIndex: e.wordIndex, label: `${e.number}${e.direction === 'across' ? 'A' : 'D'} · ${e.word}` }));
}

export default function CrosswordMediaManager({ words, media, setMedia }) {
  const opts = wordOptions(words);
  const [recording, setRecording] = useState(null);
  const recRef = useRef(null);

  const update = (i, patch) => setMedia((m) => m.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const remove = (i) => setMedia((m) => m.filter((_, idx) => idx !== i));
  const addItem = (type) => setMedia((m) => [...m, { id: Math.random().toString(36).slice(2), type, url: '', row: 0, col: 0, words: [] }]);

  async function uploadFile(i, file) {
    if (!file) return;
    try { const { url } = await api.upload(file); update(i, { url }); }
    catch (e) { alert(e.message); }
  }

  async function toggleRecord(i) {
    if (recording === i) { recRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(null); recRef.current = null;
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        try { const { url } = await api.upload(file); update(i, { url }); } catch (e) { alert(e.message); }
      };
      recRef.current = rec; setRecording(i); rec.start();
    } catch (e) { alert('Mic unavailable: ' + e.message); }
  }

  function addWord(i, wordIndex, max) {
    setMedia((m) => m.map((x, idx) => {
      if (idx !== i || x.words.includes(wordIndex)) return x;
      return { ...x, words: [...x.words, wordIndex].slice(0, max) };
    }));
  }
  const removeWord = (i, wordIndex) => setMedia((m) => m.map((x, idx) => (idx === i ? { ...x, words: x.words.filter((w) => w !== wordIndex) } : x)));

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-neutral-500">Media tiles (optional) — plotted into the blank space; linked words live-validate.</p>
      {media.map((item, i) => {
        const max = item.type === 'photo' ? 6 : 4;
        return (
          <div key={item.id} className="space-y-2 rounded-xl border border-neutral-200 p-3">
            <div className="flex items-center justify-between">
              <span className="rounded px-2 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: item.type === 'photo' ? '#3b82f6' : PINK }}>
                {item.type === 'photo' ? 'PHOTO 2×3' : 'VOICE 2×2'}
              </span>
              <button onClick={() => remove(i)} className="text-xs font-semibold text-red-600">Remove</button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {item.type === 'voice' ? (
                <>
                  <button onClick={() => toggleRecord(i)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${recording === i ? 'bg-red-500' : 'bg-neutral-700'}`}>
                    {recording === i ? 'Stop' : 'Record'}
                  </button>
                  <label className="cursor-pointer rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700">
                    Upload<input type="file" accept="audio/*" className="hidden" onChange={(e) => uploadFile(i, e.target.files?.[0])} />
                  </label>
                  {item.url && <audio src={item.url} controls className="h-8" />}
                </>
              ) : (
                <>
                  <label className="cursor-pointer rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700">
                    Upload photo<input type="file" accept="image/*" className="hidden" onChange={(e) => uploadFile(i, e.target.files?.[0])} />
                  </label>
                  {item.url && <img src={item.url} alt="" className="h-12 w-12 rounded object-cover" />}
                </>
              )}
            </div>

            <div>
              <div className="mb-1 flex flex-wrap gap-1">
                {item.words.map((wi) => {
                  const o = opts.find((x) => x.wordIndex === wi);
                  return (
                    <span key={wi} className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">
                      {o?.label ?? `#${wi}`}
                      <button onClick={() => removeWord(i, wi)} aria-label="unlink">×</button>
                    </span>
                  );
                })}
              </div>
              {item.words.length < max && (
                <select
                  value=""
                  onChange={(e) => { if (e.target.value !== '') addWord(i, Number(e.target.value), max); }}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm"
                >
                  <option value="">Add reveal word ({item.words.length}/{max})</option>
                  {opts.filter((o) => !item.words.includes(o.wordIndex)).map((o) => (
                    <option key={o.wordIndex} value={o.wordIndex}>{o.label}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-neutral-600">
              <span className="text-neutral-500">Top-left square:</span>
              <label>row <input type="number" min={0} value={item.row} onChange={(e) => update(i, { row: Math.max(0, Number(e.target.value) || 0) })} className="w-14 rounded border border-neutral-200 bg-white px-1 py-0.5" /></label>
              <label>col <input type="number" min={0} value={item.col} onChange={(e) => update(i, { col: Math.max(0, Number(e.target.value) || 0) })} className="w-14 rounded border border-neutral-200 bg-white px-1 py-0.5" /></label>
            </div>
          </div>
        );
      })}

      <div className="flex gap-2">
        <button onClick={() => addItem('voice')} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700">+ Voice note</button>
        <button onClick={() => addItem('photo')} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700">+ Photo</button>
      </div>
    </div>
  );
}
