import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function TruthOrDarePage() {
  const [type, setType] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function pick(t) {
    setBusy(true); setError(null);
    try {
      const result = await api.getRandomTodPrompt(t);
      setType(t);
      setPrompt(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setType(null);
    setPrompt(null);
    setError(null);
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6 py-6">
      <div className="flex w-full items-center justify-between">
        <Link to="/" className="text-sm text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold">Truth or Dare</h1>
        <button onClick={reset} className="text-sm text-neutral-500" aria-label="Reset">
          {prompt ? 'Reset' : ''}
        </button>
      </div>

      {!prompt && (
        <div className="grid w-full grid-cols-2 gap-3">
          <button
            onClick={() => pick('truth')}
            disabled={busy}
            className="rounded-2xl bg-amber-600 py-12 text-2xl font-extrabold tracking-wide text-amber-900 transition hover:scale-[1.02] active:scale-95 disabled:opacity-40"
          >
            TRUTH
          </button>
          <button
            onClick={() => pick('dare')}
            disabled={busy}
            className="rounded-2xl bg-pink-200 py-12 text-2xl font-extrabold tracking-wide text-pink-900 transition hover:scale-[1.02] active:scale-95 disabled:opacity-40"
          >
            DARE
          </button>
        </div>
      )}

      {error && (
        <div className="w-full rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {prompt && (
        <div className={`w-full rounded-2xl p-6 text-center ${type === 'truth' ? 'bg-amber-100 text-amber-900' : 'bg-pink-100 text-pink-900'}`}>
          <p className="text-xs font-bold uppercase tracking-widest opacity-60">{type}</p>
          <p className="mt-3 text-xl font-semibold leading-snug">{prompt.text}</p>
        </div>
      )}

      {prompt && (
        <div className="grid w-full grid-cols-2 gap-3">
          <button
            onClick={() => pick(type === 'truth' ? 'dare' : 'truth')}
            disabled={busy}
            className={`rounded-xl py-3 text-sm font-semibold transition active:scale-95 disabled:opacity-40 ${
              type === 'truth' ? 'bg-pink-200 text-pink-900' : 'bg-amber-600 text-amber-900'
            }`}
          >
            Switch to {type === 'truth' ? 'Dare' : 'Truth'}
          </button>
          <button
            onClick={() => pick(type)}
            disabled={busy}
            className="rounded-xl border border-neutral-300 bg-white py-3 text-sm font-semibold text-neutral-700 transition active:scale-95 disabled:opacity-40"
          >
            Another {type}
          </button>
        </div>
      )}
    </div>
  );
}
