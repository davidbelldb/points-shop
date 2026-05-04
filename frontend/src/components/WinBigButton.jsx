import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const COMPLETED_KEY = 'completed_surveys';

function readCompleted() {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function markCompletedLocal(id) {
  try {
    const map = readCompleted();
    map[id] = true;
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(map));
  } catch {}
}

export default function WinBigButton() {
  const [survey, setSurvey] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.getActiveSurvey()
      .then((s) => {
        setSurvey(s);
        if (s) {
          const map = readCompleted();
          setCompleted(!!map[s.id]);
        }
      })
      .catch(() => setSurvey(null));
  }, []);

  if (!survey || completed) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed left-3 top-1/2 z-30 flex h-20 w-20 -translate-y-1/2 items-center justify-center rounded-full bg-amber-600 font-extrabold text-amber-900 shadow-lg ring-4 ring-amber-300/40 transition hover:scale-105 active:scale-95"
        aria-label="Open survey"
      >
        <span className="text-center text-base leading-none">WIN<br/>BIG</span>
      </button>
      {open && (
        <SurveyModal
          survey={survey}
          onClose={() => setOpen(false)}
          onCompleted={() => {
            markCompletedLocal(survey.id);
            setCompleted(true);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function SurveyModal({ survey, onClose, onCompleted }) {
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function setAnswer(qid, value) {
    setAnswers((a) => ({ ...a, [qid]: value }));
  }

  async function submit() {
    for (const q of survey.questions) {
      if (q.is_required) {
        const v = answers[q.id];
        if (v === undefined || v === null || v === '') {
          setError(`Please answer: ${q.question_text}`);
          return;
        }
      }
    }
    setBusy(true);
    setError(null);
    try {
      const list = survey.questions.map((q) => ({
        question_id: q.id,
        value: answers[q.id] ?? '',
      }));
      await api.submitSurveyResponse(survey.id, list);
      onCompleted();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100"
          aria-label="Close"
        >
          {'\u00d7'}
        </button>

        <h2 className="pr-8 text-2xl font-bold tracking-tight">{survey.title}</h2>
        {survey.subtitle && (
          <p className="mt-2 text-sm text-neutral-600">{survey.subtitle}</p>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="mt-5 space-y-4"
        >
          {survey.questions.map((q) => (
            <QuestionInput
              key={q.id}
              question={q}
              value={answers[q.id]}
              onChange={(v) => setAnswer(q.id, v)}
            />
          ))}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-amber-600 py-3 text-sm font-semibold text-amber-900 shadow-sm transition active:scale-[0.99] disabled:opacity-40"
          >
            {busy ? 'Submitting...' : 'Submit entry'}
          </button>
        </form>

        {survey.asterisk_text && (
          <p className="mt-4 text-xs text-neutral-400">*{survey.asterisk_text}</p>
        )}
      </div>
    </div>
  );
}

function QuestionInput({ question: q, value, onChange }) {
  const label = (
    <label className="block text-sm font-medium text-neutral-800">
      {q.question_text}
      {q.is_required && <span className="text-red-500"> *</span>}
    </label>
  );

  if (q.question_type === 'text') {
    return (
      <div className="space-y-1">
        {label}
        <textarea
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="block w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
        />
      </div>
    );
  }

  if (q.question_type === 'slider') {
    const v = value ?? 5;
    return (
      <div className="space-y-1">
        {label}
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">0</span>
          <input
            type="range"
            min="0"
            max="10"
            value={v}
            onChange={(e) => onChange(Number(e.target.value))}
            className="flex-1 accent-[#106655]"
          />
          <span className="text-xs text-neutral-500">10</span>
          <span className="ml-1 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-amber-100 px-2 text-sm font-semibold text-amber-900">
            {v}
          </span>
        </div>
      </div>
    );
  }

  if (q.question_type === 'radio') {
    const opts = Array.isArray(q.options) ? q.options : [];
    return (
      <div className="space-y-1">
        {label}
        <div className="space-y-1">
          {opts.map((opt, i) => (
            <label key={i} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm hover:bg-neutral-50">
              <input
                type="radio"
                name={`q-${q.id}`}
                checked={value === opt}
                onChange={() => onChange(opt)}
                className="h-4 w-4 accent-[#106655]"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (q.question_type === 'dropdown') {
    const opts = Array.isArray(q.options) ? q.options : [];
    return (
      <div className="space-y-1">
        {label}
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
        >
          <option value="">— pick one —</option>
          {opts.map((opt, i) => (
            <option key={i} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  return null;
}
