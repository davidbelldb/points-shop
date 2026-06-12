import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useSettings } from '../lib/SettingsContext.jsx';

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

export default function AdminGamesSection({ bare = false }) {
  const body = (
    <div className="space-y-3">
      <GamesSettingsCard />
      <Magic8BallSettingsCard />
      <TodPromptsCard />
    </div>
  );
  if (bare) return body;
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Games</h2>
      {body}
    </section>
  );
}

function GamesSettingsCard() {
  const { settings, refresh } = useSettings();
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTitle(settings.games_title ?? '');
    setSubtitle(settings.games_subtitle ?? '');
  }, [settings.games_title, settings.games_subtitle]);

  async function save() {
    setBusy(true);
    try {
      await api.admin.updateSettings({
        games_title: title || null,
        games_subtitle: subtitle || null,
      });
      await refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-sm font-semibold">Games section header</p>
      <Field label="Title (above carousel)">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Games" />
      </Field>
      <Field label="Subtitle (small grey text)">
        <input className={inputCls} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Pick your poison." />
      </Field>
      <div className="flex justify-end">
        <button onClick={save} disabled={busy} className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-amber-900 disabled:opacity-40">
          {busy ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function Magic8BallSettingsCard() {
  const { settings, refresh } = useSettings();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setVisible(settings.magic8ball_homepage_visible === 'true');
  }, [settings.magic8ball_homepage_visible]);

  async function save(next) {
    setVisible(next);
    setBusy(true);
    try {
      await api.admin.updateSettings({
        magic8ball_homepage_visible: next ? 'true' : 'false',
      });
      await refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-sm font-semibold">Magic 8-Ball</p>
      <p className="text-xs text-neutral-500">
        Picks a movie/show or game from the watchlist or playlist. Playable at{' '}
        <code>/magic-8-ball</code>.
      </p>
      <label className="flex items-center justify-between text-xs font-medium text-neutral-600">
        Show on homepage
        <input
          type="checkbox"
          checked={visible}
          disabled={busy}
          onChange={(e) => save(e.target.checked)}
          className="h-4 w-4 accent-amber-600"
        />
      </label>
    </div>
  );
}

function TodPromptsCard() {
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try { setPrompts(await api.admin.listTodPrompts()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const truths = prompts.filter((p) => p.type === 'truth');
  const dares = prompts.filter((p) => p.type === 'dare');

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-sm font-semibold">Truth or Dare prompts</p>
      {loading ? (
        <p className="text-xs text-neutral-500">Loading...</p>
      ) : (
        <>
          <PromptList label={`Truths (${truths.length})`} items={truths} onChanged={load} />
          <PromptList label={`Dares (${dares.length})`} items={dares} onChanged={load} />
          <NewPromptForm onCreated={load} />
        </>
      )}
    </div>
  );
}

function PromptList({ label, items, onChanged }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      {items.length === 0 ? (
        <p className="text-xs italic text-neutral-400">None yet.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((p) => <PromptRow key={p.id} prompt={p} onChanged={onChanged} />)}
        </ul>
      )}
    </div>
  );
}

function PromptRow({ prompt, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(prompt.text);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try { await api.admin.updateTodPrompt(prompt.id, { is_active: !prompt.is_active }); await onChanged(); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true);
    try { await api.admin.updateTodPrompt(prompt.id, { text }); setEditing(false); await onChanged(); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm('Delete this prompt?')) return;
    setBusy(true);
    try { await api.admin.deleteTodPrompt(prompt.id); await onChanged(); }
    finally { setBusy(false); }
  }

  return (
    <li className="flex items-start gap-2 rounded-lg border border-neutral-100 bg-neutral-50 p-2 text-sm">
      {editing ? (
        <div className="flex-1 space-y-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className={inputCls}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setEditing(false); setText(prompt.text); }} className="text-xs text-neutral-500">Cancel</button>
            <button onClick={save} disabled={busy} className="rounded-md bg-amber-600 px-2 py-1 text-xs font-semibold text-amber-900 disabled:opacity-40">Save</button>
          </div>
        </div>
      ) : (
        <>
          <p className={`flex-1 text-sm ${prompt.is_active ? '' : 'text-neutral-400 line-through'}`}>{prompt.text}</p>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button onClick={() => setEditing(true)} className="text-xs text-amber-700">Edit</button>
            <button onClick={toggle} disabled={busy} className="text-xs text-neutral-500">{prompt.is_active ? 'Hide' : 'Show'}</button>
            <button onClick={remove} disabled={busy} className="text-xs text-neutral-400 hover:text-red-600">Delete</button>
          </div>
        </>
      )}
    </li>
  );
}

function NewPromptForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('truth');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.admin.createTodPrompt({ type, text: text.trim() });
      setText(''); setType('truth'); setOpen(false);
      await onCreated();
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="block w-full rounded-lg border-2 border-dashed border-neutral-300 py-2 text-xs font-semibold text-neutral-500 hover:border-amber-500 hover:text-amber-700"
      >
        + New prompt
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-2">
      <Field label="Type">
        <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="truth">Truth</option>
          <option value="dare">Dare</option>
        </select>
      </Field>
      <Field label="Prompt text">
        <textarea className={inputCls} rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What's the worst lie you've told?" />
      </Field>
      <div className="flex justify-end gap-2">
        <button onClick={() => { setOpen(false); setText(''); }} className="text-xs text-neutral-500">Cancel</button>
        <button onClick={submit} disabled={busy || !text.trim()} className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-amber-900 disabled:opacity-40">
          {busy ? 'Saving...' : 'Add'}
        </button>
      </div>
    </div>
  );
}
