import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { syncOmwShortcuts } from '../lib/omwActivity.js';
import CambridgeLocationPicker from '../components/omw/CambridgeLocationPicker.jsx';

/*
 * Admin "On My Way" — David configures every user's destinations + transport in
 * one place. Each person only ever sees their OWN destinations on their phone's
 * long-press / Siri (the device syncs the logged-in user's list), so setting
 * Katie's here just makes them show up on her phone, never on David's.
 */

function transportOptionsFor(username) {
  return username === 'katie' ? ['uber'] : ['bicycle', 'scooter'];
}

// Optional friendly name for a slot. Blank clears it (the app then shows the
// street/place label). Saves on Enter or the Save button.
function AliasInput({ dest, disabled, onSave }) {
  const [val, setVal] = useState(dest.alias || '');
  useEffect(() => { setVal(dest.alias || ''); }, [dest.alias]);
  const dirty = val.trim() !== (dest.alias || '').trim();
  return (
    <div className="mt-1 flex items-center gap-2">
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && dirty) onSave(val.trim()); }}
        placeholder={`Name (optional) — defaults to “${dest.label}”`}
        disabled={disabled}
        className="flex-1 rounded-md border border-neutral-200 px-2 py-1 text-xs"
      />
      {dirty && (
        <button type="button" onClick={() => onSave(val.trim())} disabled={disabled}
          className="shrink-0 rounded-md bg-sky-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-60">
          Save name
        </button>
      )}
    </div>
  );
}

// One reply-phrase slot: the short PILL the user taps + the SENT line that shows
// on both banners (with {name}/{obj}/{poss} filled from the sender). Blank pill
// clears the slot. Saves on Enter (either field) or the Save button.
function ReplyPhraseInput({ phrase, disabled, onSave }) {
  const [label, setLabel] = useState(phrase?.text || '');
  const [tmpl, setTmpl] = useState(phrase?.sent_template || '');
  useEffect(() => { setLabel(phrase?.text || ''); setTmpl(phrase?.sent_template || ''); }, [phrase?.text, phrase?.sent_template]);
  const dirty = label.trim() !== (phrase?.text || '').trim() || tmpl.trim() !== (phrase?.sent_template || '').trim();
  const save = () => onSave({ text: label, template: tmpl });
  const onEnter = (e) => { if (e.key === 'Enter' && dirty) save(); };
  return (
    <div className="space-y-1 rounded-md border border-neutral-200 p-1.5">
      <input
        type="text" value={label} maxLength={120} disabled={disabled}
        onChange={(e) => setLabel(e.target.value)} onKeyDown={onEnter}
        placeholder="Pill (e.g. cuddle me)"
        className="w-full rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium"
      />
      <input
        type="text" value={tmpl} maxLength={160} disabled={disabled}
        onChange={(e) => setTmpl(e.target.value)} onKeyDown={onEnter}
        placeholder="Sent: {name} wants you to cuddle {obj}"
        className="w-full rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-600"
      />
      {dirty && (
        <button type="button" onClick={save} disabled={disabled}
          className="rounded-md bg-sky-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-60">
          {label.trim() ? 'Save' : 'Clear'}
        </button>
      )}
    </div>
  );
}

function UserOmwEditor({ account }) {
  const [dests, setDests] = useState(null);
  const [transport, setTransport] = useState(null);
  const [phrases, setPhrases] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [savedPos, setSavedPos] = useState(null);
  const options = transportOptionsFor(account.username);

  useEffect(() => {
    api.omw.adminListDestinations(account.id).then((r) => setDests(r.destinations)).catch((e) => setError(e.message));
    api.omw.adminGetTransport(account.id).then((r) => setTransport(r.transport)).catch(() => {});
    api.omw.adminListReplyPhrases(account.id).then((r) => setPhrases(r.phrases || [])).catch(() => {});
  }, [account.id]);

  function phraseAt(pos) { return (phrases || []).find((p) => p.position === pos) || null; }

  async function savePhrase(pos, { text, template }) {
    setBusy(true); setError(null);
    try {
      if (!text.trim()) {
        await api.omw.adminDeleteReplyPhrase(account.id, pos);
        setPhrases((prev) => (prev || []).filter((p) => p.position !== pos));
      } else {
        const updated = await api.omw.adminSetReplyPhrase(account.id, pos, { text: text.trim(), template: (template || '').trim() });
        setPhrases((prev) => [...(prev || []).filter((p) => p.position !== pos), updated].sort((a, b) => a.position - b.position));
      }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  function bySlot(pos) { return (dests || []).find((d) => d.position === pos) || null; }

  async function save(pos, patch) {
    const cur = bySlot(pos) || {};
    const body = {
      label: patch.label ?? cur.label,
      alias: patch.alias !== undefined ? patch.alias : cur.alias,
      lat: patch.lat ?? cur.lat,
      lng: patch.lng ?? cur.lng,
    };
    if (!body.label || body.lat == null) { setError('Pick a place first.'); return; }
    setBusy(true); setError(null);
    try {
      const updated = await api.omw.adminSetDestination(account.id, pos, body);
      setDests((prev) => [...(prev || []).filter((d) => d.position !== pos), updated].sort((a, b) => a.position - b.position));
      setSavedPos(pos); setTimeout(() => setSavedPos(null), 1400);
      syncOmwShortcuts(); // refresh this device's own menu if it's David's list
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function remove(pos) {
    setBusy(true); setError(null);
    try {
      await api.omw.adminDeleteDestination(account.id, pos);
      setDests((prev) => (prev || []).filter((d) => d.position !== pos));
      syncOmwShortcuts();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function chooseTransport(t) {
    setTransport(t);
    try { const r = await api.omw.adminSetTransport(account.id, t); setTransport(r.transport); }
    catch (e) { setError(e.message); }
  }

  if (!dests) {
    return error
      ? <p className="text-xs text-red-600">{error} — is the backend deployed with the OMW admin endpoints?</p>
      : <p className="text-xs text-neutral-500">Loading…</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">Transport</span>
        {options.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => chooseTransport(t)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${(transport || options[0]) === t ? 'bg-sky-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {[1, 2, 3].map((pos) => {
        const d = bySlot(pos);
        return (
          <div key={pos} className="rounded-lg border border-neutral-200 p-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                Slot {pos}{pos === 1 ? ' · default' : ''}
              </span>
              {savedPos === pos && <span className="text-xs text-emerald-600">Saved ✓</span>}
            </div>
            <p className="text-sm">
              {d
                ? <><span className="font-medium">{(d.alias || '').trim() || d.label}</span>
                    {(d.alias || '').trim() && <span className="ml-1 text-[11px] text-neutral-500">· {d.label}</span>}
                    <span className="ml-1 text-[10px] text-neutral-400">({Number(d.lat).toFixed(4)}, {Number(d.lng).toFixed(4)})</span></>
                : <span className="text-neutral-400">empty</span>}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1"><CambridgeLocationPicker onPick={(loc) => save(pos, loc)} /></div>
              {d && (
                <button type="button" onClick={() => remove(pos)} disabled={busy}
                  className="shrink-0 text-xs text-neutral-400 hover:text-red-600">Clear</button>
              )}
            </div>
            {d && <AliasInput dest={d} disabled={busy} onSave={(alias) => save(pos, { alias })} />}
          </div>
        );
      })}

      {/* Tap-to-send reply phrases (up to 5) — shown as pink pills on this user's
          live map during a journey. */}
      <div className="rounded-lg border border-neutral-200 p-2">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">Reply phrases (up to 9)</span>
        <p className="mt-0.5 text-[10px] text-neutral-400">
          Top box = the pill this person taps. Bottom = what both banners show, using{' '}
          <code>{'{name}'}</code> (their name), <code>{'{obj}'}</code> (her/him/them),{' '}
          <code>{'{poss}'}</code> (her/his/their). e.g. “{'{name}'} wants you to cuddle {'{obj}'}”.
        </p>
        <div className="mt-1 space-y-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((pos) => (
            <ReplyPhraseInput
              key={pos}
              phrase={phraseAt(pos)}
              disabled={busy}
              onSave={(text) => savePhrase(pos, text)}
            />
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function AdminOmwSection() {
  const [users, setUsers] = useState(null);
  const [liveToPartner, setLiveToPartner] = useState(null);
  const [charLimit, setCharLimit] = useState(null);
  const [charSaved, setCharSaved] = useState(false);
  const [error, setError] = useState(null);
  const [killing, setKilling] = useState(false);
  const [killMsg, setKillMsg] = useState(null);

  useEffect(() => {
    api.admin.listUsers().then(setUsers).catch((e) => setError(e.message));
    api.omw.getConfig().then((c) => { setLiveToPartner(!!c.live_to_partner); setCharLimit(c.message_char_limit ?? 60); }).catch(() => {});
  }, []);

  async function toggleLive() {
    const next = !liveToPartner;
    setLiveToPartner(next);
    try { const c = await api.omw.setConfig(next); setLiveToPartner(!!c.live_to_partner); }
    catch (e) { setError(e.message); setLiveToPartner(!next); }
  }

  async function saveCharLimit(v) {
    const n = Math.max(10, Math.min(200, Math.round(Number(v) || 60)));
    setCharLimit(n);
    try {
      const c = await api.omw.setConfig(undefined, n);
      setCharLimit(c.message_char_limit ?? n);
      setCharSaved(true); setTimeout(() => setCharSaved(false), 1400);
    } catch (e) { setError(e.message); }
  }

  async function killAll() {
    setKilling(true); setKillMsg(null);
    try { const r = await api.omw.adminKillAll(); setKillMsg(`Cancelled ${r.cancelled} active trip${r.cancelled === 1 ? '' : 's'}.`); }
    catch (e) { setKillMsg(e.message); } finally { setKilling(false); }
  }

  if (!users) {
    return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-neutral-500">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">
        Set each person’s destinations + transport. Everyone only sees their own on their phone’s long-press and Siri.
        Slot 1 is the default the quick action fires. Search is limited to Cambridge.
      </p>

      {liveToPartner !== null && (
        <div className={`flex items-center justify-between rounded-xl border p-3 ${liveToPartner ? 'border-emerald-300 bg-emerald-50' : 'border-neutral-200'}`}>
          <div className="pr-3">
            <p className="text-sm font-medium">Go two-way</p>
            <p className="text-[11px] text-neutral-500">
              {liveToPartner
                ? 'Live: trips push to the other person’s device.'
                : 'Testing: trips loop back to the traveller’s own device only.'}
            </p>
          </div>
          <button type="button" onClick={toggleLive}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${liveToPartner ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-700'}`}>
            {liveToPartner ? 'On' : 'Off'}
          </button>
        </div>
      )}

      {/* Free-text message length cap (keeps the map message from truncating in
          the one-line Live Activity subtitle). */}
      {charLimit !== null && (
        <div className="flex items-center justify-between rounded-xl border border-neutral-200 p-3">
          <div className="pr-3">
            <p className="text-sm font-medium">Message character limit</p>
            <p className="text-[11px] text-neutral-500">
              Max length of a typed map message so it doesn’t truncate on the banner.
              {charSaved && <span className="ml-1 text-emerald-600">Saved ✓</span>}
            </p>
          </div>
          <input
            type="number" min={10} max={200} defaultValue={charLimit}
            onBlur={(e) => saveCharLimit(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
            className="w-20 shrink-0 rounded-md border border-neutral-200 px-2 py-1 text-sm"
          />
        </div>
      )}

      {/* Kill switch — cancel every active trip (clears zombie/stuck trips). */}
      <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3">
        <div className="pr-3">
          <p className="text-sm font-medium text-red-800">End all active trips</p>
          <p className="text-[11px] text-red-600">Cancels every in-progress journey and dismisses its Live Activity.</p>
          {killMsg && <p className="mt-1 text-[11px] text-neutral-700">{killMsg}</p>}
        </div>
        <button type="button" onClick={killAll} disabled={killing}
          className="shrink-0 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">
          {killing ? 'Ending…' : 'End all'}
        </button>
      </div>

      {users.map((u) => (
        <div key={u.id} className="rounded-xl border border-neutral-200 p-3">
          <p className="text-sm font-medium">
            {u.name || u.username}
            <span className="ml-2 text-[10px] uppercase tracking-wide text-neutral-400">{u.role}</span>
          </p>
          <div className="mt-2"><UserOmwEditor account={u} /></div>
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
