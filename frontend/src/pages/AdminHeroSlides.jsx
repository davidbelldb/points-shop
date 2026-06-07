import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const inputCls =
  'block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none';

function Field({ label, children }) {
  return (
    <label className="block text-xs font-medium text-neutral-600">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export default function AdminHeroSlides({ bare = false }) {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    try { setSlides(await api.admin.listAllHeroSlides()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // Move a slide up or down within its placement group, then save new sort_orders.
  async function move(slide, direction) {
    const group = slides.filter(s => s.placement === slide.placement);
    const idx = group.findIndex(s => s.id === slide.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= group.length) return;

    // Swap in the group array
    const reordered = [...group];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

    // Persist new sort_orders only for the two swapped slides
    await Promise.all([
      api.admin.updateHeroSlide(reordered[idx].id,    { sort_order: idx }),
      api.admin.updateHeroSlide(reordered[swapIdx].id, { sort_order: swapIdx }),
    ]);
    await load();
  }

  const body = (
    <>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : (
        <>
          <ul className="space-y-2">
            {slides.map((s) => {
              const group = slides.filter(g => g.placement === s.placement);
              const idx   = group.findIndex(g => g.id === s.id);
              return (
                <SlideRow
                  key={s.id}
                  slide={s}
                  onChanged={load}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < group.length - 1}
                  onMoveUp={() => move(s, -1)}
                  onMoveDown={() => move(s, 1)}
                />
              );
            })}
          </ul>
          <NewSlideForm onCreated={load} />
        </>
      )}
    </>
  );

  if (bare) return <div className="space-y-3">{body}</div>;
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Hero carousel slides</h2>
      {body}
    </section>
  );
}

function SlideRow({ slide, onChanged, canMoveUp, canMoveDown, onMoveUp, onMoveDown }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border border-neutral-200 bg-white">
      <div className="flex w-full gap-3 p-3">
        {/* Reorder buttons */}
        <div className="flex shrink-0 flex-col justify-center gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp}
            title="Move up"
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-20 disabled:cursor-default"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M5 1 L9 8 L1 8 Z"/></svg>
          </button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown}
            title="Move down"
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-20 disabled:cursor-default"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M5 9 L9 2 L1 2 Z"/></svg>
          </button>
        </div>

        {/* Thumbnail + info \u2014 clicking toggles editor */}
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 gap-3 text-left">
          <div className="aspect-[16/7] w-32 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
            <img src={slide.image_url} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {slide.title || <span className="text-neutral-400">(no title)</span>}
              <span className="ml-2 text-xs font-normal text-neutral-400">[{slide.placement}]</span>
              {!slide.is_active && <span className="ml-2 text-xs font-normal text-neutral-400">(hidden)</span>}
            </p>
            {slide.code && <p className="font-mono text-xs text-amber-700">{slide.code}</p>}
            {slide.subtitle && <p className="truncate text-xs text-neutral-500">{slide.subtitle}</p>}
            {slide.link_url && <p className="truncate font-mono text-xs text-neutral-500">{slide.link_url}</p>}
          </div>
          <span className="self-center text-neutral-400">{open ? '\u2212' : '+'}</span>
        </button>
      </div>
      {open && <SlideEditor slide={slide} onChanged={onChanged} />}
    </li>
  );
}

function SlideEditor({ slide, onChanged }) {
  const [form, setForm] = useState({
    image_url: slide.image_url,
    title: slide.title ?? '',
    subtitle: slide.subtitle ?? '',
    code: slide.code ?? '',
    link_url: slide.link_url ?? '',
    placement: slide.placement || 'top',
    is_active: slide.is_active,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function uploadImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setBusy(true); setError(null);
    try {
      const { url, type } = await api.admin.upload(file);
      if (type !== 'image') throw new Error('Image required');
      setForm((f) => ({ ...f, image_url: url }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      await api.admin.updateHeroSlide(slide.id, {
        image_url: form.image_url,
        title: form.title.trim() || null,
        subtitle: form.subtitle.trim() || null,
        code: form.code.trim().toUpperCase() || null,
        link_url: form.link_url.trim() || null,
        placement: form.placement,
        is_active: form.is_active,
      });
      await onChanged();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm('Delete this slide?')) return;
    setBusy(true); setError(null);
    try { await api.admin.deleteHeroSlide(slide.id); await onChanged(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3 border-t border-neutral-100 p-3">
      <div className="aspect-[16/7] overflow-hidden rounded-lg bg-neutral-100">
        <img src={form.image_url} alt="" className="h-full w-full object-cover" />
      </div>
      <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-neutral-300 px-3 py-2 text-center text-xs text-neutral-500 hover:border-amber-500">
        Replace image
        <input type="file" accept="image/*" className="hidden" onChange={uploadImage} />
      </label>
      <Field label="Placement">
        <select className={inputCls} value={form.placement} onChange={(e) => setForm((f) => ({ ...f, placement: e.target.value }))}>
          <option value="top">Top (above products)</option>
          <option value="games">Games (below products)</option>
        </select>
      </Field>
      <Field label="Title">
        <input className={inputCls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
      </Field>
      <Field label="Subtitle">
        <input className={inputCls} value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />
      </Field>
      <Field label="Code (optional)">
        <input className={inputCls} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="SUMMER10" />
      </Field>
      <Field label="Link URL (optional, e.g. /games/truth-or-dare)">
        <input className={inputCls} value={form.link_url} onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))} placeholder="/games/truth-or-dare" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
        Active (visible in carousel)
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={remove} disabled={busy} className="text-sm text-neutral-400 hover:text-red-600 disabled:opacity-50">
          Delete
        </button>
        <button onClick={save} disabled={busy} className="ml-auto rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-40">
          {busy ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function NewSlideForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    image_url: '', title: '', subtitle: '', code: '',
    link_url: '', placement: 'top',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function reset() {
    setForm({ image_url: '', title: '', subtitle: '', code: '', link_url: '', placement: 'top' });
    setError(null);
  }

  async function uploadImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setBusy(true); setError(null);
    try {
      const { url, type } = await api.admin.upload(file);
      if (type !== 'image') throw new Error('Image required');
      setForm((f) => ({ ...f, image_url: url }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!form.image_url) { setError('Image required'); return; }
    setBusy(true); setError(null);
    try {
      await api.admin.createHeroSlide({
        image_url: form.image_url,
        title: form.title.trim() || null,
        subtitle: form.subtitle.trim() || null,
        code: form.code.trim().toUpperCase() || null,
        link_url: form.link_url.trim() || null,
        placement: form.placement,
      });
      reset(); setOpen(false); await onCreated();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="block w-full rounded-xl border-2 border-dashed border-neutral-300 py-3 text-sm font-semibold text-neutral-500 hover:border-amber-500 hover:text-amber-700"
      >
        + New slide
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-sm font-semibold">New slide</p>
      <div className="aspect-[16/7] overflow-hidden rounded-lg bg-neutral-100">
        {form.image_url ? (
          <img src={form.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">No image yet</div>
        )}
      </div>
      <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-neutral-300 px-3 py-2 text-center text-xs text-neutral-500 hover:border-amber-500">
        {form.image_url ? 'Replace image' : 'Upload image'}
        <input type="file" accept="image/*" className="hidden" onChange={uploadImage} />
      </label>
      <Field label="Placement">
        <select className={inputCls} value={form.placement} onChange={(e) => setForm((f) => ({ ...f, placement: e.target.value }))}>
          <option value="top">Top (above products)</option>
          <option value="games">Games (below products)</option>
        </select>
      </Field>
      <Field label="Title (optional)"><input className={inputCls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></Field>
      <Field label="Subtitle (optional)"><input className={inputCls} value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} /></Field>
      <Field label="Code (optional)"><input className={inputCls} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="SUMMER10" /></Field>
      <Field label="Link URL (optional)"><input className={inputCls} value={form.link_url} onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))} placeholder="/games/truth-or-dare" /></Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => { setOpen(false); reset(); }} className="rounded-md px-3 py-1 text-sm text-neutral-500">Cancel</button>
        <button onClick={submit} disabled={busy || !form.image_url} className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-amber-900 disabled:opacity-40">
          {busy ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  );
}
