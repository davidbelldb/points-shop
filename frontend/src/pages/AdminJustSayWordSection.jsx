import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const inputCls = 'block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none';

function NumberField({ label, value, onCommit, busy }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <label className="block text-xs font-medium text-neutral-600">
      {label}
      <input
        type="number" className={inputCls + ' mt-1'} value={v} disabled={busy}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { const n = Number(v); if (Number.isFinite(n) && n !== value) onCommit(n); }}
      />
    </label>
  );
}

export default function AdminJustSayWordSection({ bare = false }) {
  const [cfg, setCfg] = useState(null);
  const [bank, setBank] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [newSyll, setNewSyll] = useState('');

  async function load() {
    try {
      const [c, b] = await Promise.all([api.jstwGetConfig(), api.jstwBank()]);
      setCfg(c); setBank(b.words ?? []);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function save(patch) {
    setBusy(true); setError(null); setSaved(false);
    try { setCfg(await api.jstwSetConfig(patch)); setSaved(true); setTimeout(() => setSaved(false), 1500); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function addWord() {
    const word = newWord.trim().toUpperCase();
    const syllables = newSyll.split(/[-·,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!word || syllables.length === 0) { setError('Enter a word and its syllables (e.g. en-tre-pre-neur).'); return; }
    setBusy(true); setError(null);
    try { await api.jstwBankAdd(word, syllables); setNewWord(''); setNewSyll(''); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function removeWord(w) {
    setBusy(true);
    try { await api.jstwBankDelete(w); setBank((b) => b.filter((x) => x.word !== w)); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const [rerolled, setRerolled] = useState(false);
  async function reroll() {
    setBusy(true); setError(null); setRerolled(false);
    try { await api.jstwReroll(); setRerolled(true); setTimeout(() => setRerolled(false), 2000); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (!cfg) return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-neutral-500">Loading…</p>;

  const body = (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">
        Hidden pronunciation game at <code>/justsaytheword</code>. Needs AZURE_SPEECH_KEY / AZURE_SPEECH_REGION
        in the server <code>.env</code>. While “Off”, only you (admin) can open it to test.
      </p>

      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Live for both players</p>
        <button onClick={() => save({ enabled: !cfg.enabled })} disabled={busy}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${cfg.enabled ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}>
          {cfg.enabled ? 'On' : 'Off (testing)'}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={reroll} disabled={busy}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
          Re-roll today’s words
        </button>
        {rerolled && <span className="text-xs text-emerald-600">Re-rolled ✓ reload the game</span>}
        <span className="text-[11px] text-neutral-400">(clears today’s words + scores)</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Min letters" value={cfg.min_len} onCommit={(n) => save({ min_len: n })} busy={busy} />
        <NumberField label="Max letters" value={cfg.max_len} onCommit={(n) => save({ max_len: n })} busy={busy} />
        <NumberField label="Min syllables" value={cfg.min_syllables} onCommit={(n) => save({ min_syllables: n })} busy={busy} />
        <NumberField label="Max syllables" value={cfg.max_syllables} onCommit={(n) => save({ max_syllables: n })} busy={busy} />
        <NumberField label="Words per day" value={cfg.words_per_day} onCommit={(n) => save({ words_per_day: n })} busy={busy} />
      </div>

      <div>
        <p className="text-xs font-medium text-neutral-600 mb-1">Add a word (syllables split by hyphen)</p>
        <div className="flex gap-2">
          <input className={inputCls} placeholder="ENTREPRENEUR" value={newWord} onChange={(e) => setNewWord(e.target.value)} />
          <input className={inputCls} placeholder="en-tre-pre-neur" value={newSyll} onChange={(e) => setNewSyll(e.target.value)} />
          <button onClick={addWord} disabled={busy} className="shrink-0 rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-white">Add</button>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-neutral-600 mb-1">Word bank ({bank.length})</p>
        <div className="max-h-60 overflow-y-auto rounded-md border border-neutral-200 divide-y divide-neutral-100">
          {bank.map((w) => (
            <div key={w.word} className="flex items-center justify-between px-2 py-1.5 text-xs">
              <span className="font-semibold">{w.word}</span>
              <span className="text-neutral-400">{(Array.isArray(w.syllables) ? w.syllables : []).join('·')} · {w.length}L/{w.syllable_count}s</span>
              <button onClick={() => removeWord(w.word)} disabled={busy} className="text-red-500 hover:text-red-700">×</button>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-emerald-600">Saved ✓</p>}
    </div>
  );

  if (bare) return body;
  return <section className="rounded-2xl border border-neutral-200 bg-white p-4">{body}</section>;
}
