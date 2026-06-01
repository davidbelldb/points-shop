import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useSettings } from '../lib/SettingsContext.jsx';

const inputCls =
  'block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none';

export default function AdminAudioSection({ bare = false }) {
  const { settings, refresh: refreshSettings } = useSettings();
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const enabled = settings.audio_section_enabled === 'true';

  async function loadNotes() {
    try { setNotes(await api.admin.listAllAudioNotes()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { loadNotes(); }, []);
  useEffect(() => {
    setTitle(settings.audio_title ?? '');
    setSubtitle(settings.audio_subtitle ?? '');
  }, [settings.audio_title, settings.audio_subtitle]);

  async function toggleSection() {
    setBusy(true); setError(null);
    try {
      await api.admin.updateSettings({ audio_section_enabled: enabled ? 'false' : 'true' });
      await refreshSettings();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function saveText() {
    setBusy(true); setError(null);
    try {
      await api.admin.updateSettings({ audio_title: title, audio_subtitle: subtitle });
      await refreshSettings();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const toggleBtn = (
    <button
      onClick={toggleSection}
      disabled={busy}
      className={`rounded-full px-3 py-1 text-xs font-semibold ${enabled ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}
    >
      {enabled ? 'Section shown' : 'Section hidden'}
    </button>
  );

  const body = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {bare ? <span /> : null}
        {toggleBtn}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <label className="block text-xs font-medium text-neutral-600">
        Section title
        <input className={inputCls + ' mt-1'} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A message from our founder" />
      </label>
      <label className="block text-xs font-medium text-neutral-600">
        Section subtitle
        <input className={inputCls + ' mt-1'} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Have a listen..." />
      </label>
      <button onClick={saveText} disabled={busy} className="w-full rounded-md bg-amber-600 py-2 text-sm font-semibold text-amber-900 disabled:opacity-40">
        Save section text
      </button>
      <hr className="border-neutral-200" />
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Audio notes</p>
        {notes.map((n) => (
          <NoteRow key={n.id} note={n} busy={busy} setBusy={setBusy} onChanged={loadNotes} />
        ))}
        <NewNoteForm busy={busy} setBusy={setBusy} onCreated={loadNotes} />
      </div>
    </div>
  );

  if (bare) return body;
  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Voice notes</h2>
        {toggleBtn}
      </div>
      {body}
    </section>
  );
}

function NoteRow({ note, busy, setBusy, onChanged }) {
  const [name, setName] = useState(note.name ?? '');
  const [err, setErr] = useState(null);
  useEffect(() => { setName(note.name ?? ''); }, [note.name]);
  const dirty = name !== (note.name ?? '');

  async function run(fn) {
    setBusy(true); setErr(null);
    try { await fn(); await onChanged(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  function remove() {
    if (!confirm('Delete this voice note?')) return;
    run(() => api.admin.deleteAudioNote(note.id));
  }

  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-700">Voice note</span>
        <button
          onClick={() => run(() => api.admin.updateAudioNote(note.id, { is_active: !note.is_active }))}
          disabled={busy}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${note.is_active ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}
        >
          {note.is_active ? 'Visible' : 'Hidden'}
        </button>
      </div>
      <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Note name (shown on the card)" />
      <audio src={note.audio_url} controls preload="none" className="w-full" />
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex items-center gap-2">
        <button onClick={remove} disabled={busy} className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50">
          Delete
        </button>
        <button
          onClick={() => run(() => api.admin.updateAudioNote(note.id, { name }))}
          disabled={busy || !dirty}
          className="ml-auto rounded-md bg-amber-600 px-4 py-1.5 text-sm font-semibold text-amber-900 disabled:opacity-30"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function NewNoteForm({ busy, setBusy, onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [err, setErr] = useState(null);

  function reset() { setName(''); setAudioUrl(''); setErr(null); }

  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setBusy(true); setErr(null);
    try {
      const { url, type } = await api.admin.upload(file);
      if (type !== 'audio') throw new Error('Please choose an audio file.');
      setAudioUrl(url);
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  async function create() {
    if (!audioUrl) { setErr('Upload an audio file first.'); return; }
    setBusy(true); setErr(null);
    try {
      await api.admin.createAudioNote({ name: name.trim(), audio_url: audioUrl });
      reset(); setOpen(false);
      await onCreated();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="block w-full rounded-xl border-2 border-dashed border-neutral-300 py-3 text-sm font-semibold text-neutral-500 hover:border-amber-500 hover:text-amber-700"
      >
        + New voice note
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-2.5">
      <p className="text-sm font-semibold">New voice note</p>
      <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Note name (shown on the card)" />
      <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-neutral-300 px-3 py-2 text-center text-xs text-neutral-500 hover:border-amber-500">
        {audioUrl ? 'Replace audio file' : 'Upload audio file'}
        <input type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.webm,.mp4" className="hidden" onChange={upload} />
      </label>
      {audioUrl && <audio src={audioUrl} controls preload="none" className="w-full" />}
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => { setOpen(false); reset(); }} className="rounded-md px-3 py-1 text-sm text-neutral-500">
          Cancel
        </button>
        <button onClick={create} disabled={busy || !audioUrl} className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-amber-900 disabled:opacity-40">
          Create
        </button>
      </div>
    </div>
  );
}
