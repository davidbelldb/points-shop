/**
 * AdminGroceriesSection — the house grocery catalogue.
 *
 * Add products by hand (name + photo screenshotted from the Waitrose app).
 * Optionally attach a photo OF the barcode: we store the image and try to
 * decode the digits from it automatically (ZXing) — editable if the decode
 * gets it wrong. Scans on the shopping list check this catalogue first.
 */

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const INPUT_CLS =
  'block w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none';

export default function AdminGroceriesSection() {
  const [groceries, setGroceries] = useState([]);
  const [error, setError]   = useState(null);
  const [busy, setBusy]     = useState(false);
  const [editing, setEditing] = useState(null); // null | 'new' | grocery id

  // Form state
  const [name, setName]       = useState('');
  const [imageUrl, setImageUrl] = useState(null);
  const [barcode, setBarcode] = useState('');
  const [barcodeImageUrl, setBarcodeImageUrl] = useState(null);
  const [decoding, setDecoding] = useState(false);

  const productFileRef = useRef(null);
  const barcodeFileRef = useRef(null);
  const formRef = useRef(null);

  // Bring the form into view when it opens — on a phone it renders below the
  // list, so without this a tap on Edit looks like it did nothing.
  useEffect(() => {
    if (editing !== null) {
      setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    }
  }, [editing]);

  useEffect(() => {
    api.shopGroceries().then(({ groceries: g }) => setGroceries(g)).catch((e) => setError(e.message));
  }, []);

  function startNew() {
    setEditing('new');
    setName(''); setImageUrl(null); setBarcode(''); setBarcodeImageUrl(null);
  }

  function startEdit(g) {
    setEditing(g.id);
    setName(g.name); setImageUrl(g.image_url); setBarcode(g.barcode ?? ''); setBarcodeImageUrl(g.barcode_image_url);
  }

  async function uploadProductPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { url } = await api.upload(file);
      setImageUrl(url);
    } catch (err) { setError(`Photo upload failed: ${err.message}`); }
  }

  async function uploadBarcodePhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { url } = await api.upload(file);
      setBarcodeImageUrl(url);
      // Try to read the digits straight off the photo
      setDecoding(true);
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        const result = await reader.decodeFromImageUrl(url);
        if (result?.getText()) setBarcode(result.getText().replace(/\D/g, ''));
      } catch {
        /* couldn't decode — type the number in manually */
      } finally {
        setDecoding(false);
      }
    } catch (err) { setError(`Barcode photo upload failed: ${err.message}`); }
  }

  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true); setError(null);
    const payload = {
      name: name.trim(),
      image_url: imageUrl,
      barcode: barcode.replace(/\D/g, '') || null,
      barcode_image_url: barcodeImageUrl,
    };
    try {
      if (editing === 'new') {
        const g = await api.shopAddGrocery(payload);
        setGroceries((prev) => [...prev, g].sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        const g = await api.shopUpdateGrocery(editing, payload);
        setGroceries((prev) => prev.map((x) => (x.id === g.id ? g : x)));
      }
      setEditing(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(g) {
    if (!confirm(`Delete "${g.name}" from the catalogue?`)) return;
    try {
      await api.shopDeleteGrocery(g.id);
      setGroceries((prev) => prev.filter((x) => x.id !== g.id));
      if (editing === g.id) setEditing(null);
    } catch (e) { setError(e.message); }
  }

  return (
    <section className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {/* Catalogue list */}
      {groceries.length === 0 && editing === null && (
        <p className="text-sm text-neutral-400">No groceries in the catalogue yet.</p>
      )}
      <div className="space-y-1.5">
        {groceries.map((g) => (
          <div key={g.id} className="flex items-center gap-3 rounded-xl bg-neutral-100 px-3 py-2">
            {g.image_url
              ? <img src={g.image_url} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain" />
              : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-base">🛒</span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-neutral-900">{g.name}</span>
              {g.barcode && <span className="block text-[11px] text-neutral-500">barcode {g.barcode}</span>}
            </span>
            <button
              type="button"
              onClick={() => startEdit(g)}
              title="Edit"
              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-amber-700 active:scale-95"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => remove(g)}
              title="Delete"
              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-neutral-400 hover:text-red-700 active:scale-95"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Add / edit form */}
      {editing !== null ? (
        <div ref={formRef} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-3">
          <div>
            <label className="text-xs font-semibold text-neutral-500">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Waitrose Houmous 200g" className={`mt-1 ${INPUT_CLS}`} />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-500">Product photo</label>
              <div className="mt-1 flex items-center gap-2">
                {imageUrl && <img src={imageUrl} alt="" className="h-14 w-14 rounded-lg bg-white object-contain ring-1 ring-neutral-200" />}
                <button onClick={() => productFileRef.current?.click()} className="rounded-lg bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-700">
                  {imageUrl ? 'Replace' : 'Upload'}
                </button>
                {imageUrl && (
                  <button onClick={() => setImageUrl(null)} className="text-xs text-neutral-400 hover:text-red-700">Remove</button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-500">Barcode photo (optional)</label>
              <div className="mt-1 flex items-center gap-2">
                {barcodeImageUrl && <img src={barcodeImageUrl} alt="" className="h-14 w-20 rounded-lg bg-white object-contain ring-1 ring-neutral-200" />}
                <button onClick={() => barcodeFileRef.current?.click()} className="rounded-lg bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-700">
                  {barcodeImageUrl ? 'Replace' : 'Upload'}
                </button>
                {barcodeImageUrl && (
                  <button onClick={() => setBarcodeImageUrl(null)} className="text-xs text-neutral-400 hover:text-red-700">Remove</button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-500">
              Barcode number {decoding && <span className="font-normal text-amber-700">(reading from photo…)</span>}
            </label>
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder="Auto-filled from the photo when possible"
              className={`mt-1 ${INPUT_CLS}`}
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setEditing(null)} className="px-3 py-2 text-sm text-neutral-500">Cancel</button>
            <button
              onClick={save}
              disabled={!name.trim() || busy}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-40"
            >
              {busy ? 'Saving…' : editing === 'new' ? 'Add grocery' : 'Save changes'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={startNew}
          className="w-full rounded-xl border-2 border-dashed border-neutral-200 py-2.5 text-sm font-semibold text-neutral-500 hover:bg-neutral-100"
        >
          + Add grocery
        </button>
      )}

      <input ref={productFileRef} type="file" accept="image/*" className="hidden" onChange={uploadProductPhoto} />
      <input ref={barcodeFileRef} type="file" accept="image/*" className="hidden" onChange={uploadBarcodePhoto} />
    </section>
  );
}
