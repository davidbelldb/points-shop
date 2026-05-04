import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

function optionsToText(options, type) {
  if ((type === 'radio' || type === 'dropdown') && Array.isArray(options)) {
    return options.join('\n');
  }
  return '';
}

function textToOptions(text, type) {
  if (type === 'radio' || type === 'dropdown') {
    return text.split('\n').map((s) => s.trim()).filter(Boolean);
  }
  return null;
}

export default function AdminSurveysSection() {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try { setSurveys(await api.admin.listAllSurveys()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Surveys</h2>
      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : (
        <>
          {surveys.length > 0 && (
            <ul className="space-y-2">
              {surveys.map((s) => (
                <SurveyRow key={s.id} survey={s} onChanged={load} />
              ))}
            </ul>
          )}
          <NewSurveyForm onCreated={load} />
        </>
      )}
    </section>
  );
}

function SurveyRow({ survey, onChanged }) {
  const [open, setOpen] = useState(false);
  const qCount = (survey.questions ?? []).length;
  return (
    <li className="rounded-xl border border-neutral-200 bg-white">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 p-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {survey.title}
            {!survey.is_active && <span className="ml-2 text-xs font-normal text-neutral-400">(hidden)</span>}
          </p>
          <p className="text-xs text-neutral-500">{qCount} question{qCount === 1 ? '' : 's'}</p>
        </div>
        <span className="text-neutral-400">{open ? '\u2212' : '+'}</span>
      </button>
      {open && <SurveyEditor survey={survey} onChanged={onChanged} />}
    </li>
  );
}

function SurveyEditor({ survey, onChanged }) {
  const [form, setForm] = useState({
    title: survey.title,
    banner_text: survey.banner_text ?? '',
    subtitle: survey.subtitle ?? '',
    asterisk_text: survey.asterisk_text ?? '',
    is_active: survey.is_active,
  });
  const [questions, setQuestions] = useState(survey.questions ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function refreshQuestions() {
    try {
      const updated = await api.admin.getSurvey(survey.id);
      setQuestions(updated.questions ?? []);
    } catch (e) { console.error(e); }
  }

  async function saveSurvey() {
    setBusy(true); setError(null);
    try {
      await api.admin.updateSurvey(survey.id, {
        title: form.title.trim(),
        banner_text: form.banner_text.trim() || null,
        subtitle: form.subtitle.trim() || null,
        asterisk_text: form.asterisk_text.trim() || null,
        is_active: form.is_active,
      });
      await onChanged();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function deleteSurvey() {
    if (!confirm(`Delete survey "${survey.title}"?`)) return;
    setBusy(true); setError(null);
    try {
      await api.admin.deleteSurvey(survey.id);
      await onChanged();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3 border-t border-neutral-100 p-3">
      <div className="flex items-center justify-between">
        <Link
          to={`/admin/surveys/${survey.id}/responses`}
          className="text-sm font-medium text-amber-700 hover:underline"
        >
          View {survey.response_count ?? 0} response{survey.response_count === 1 ? '' : 's'} {'\u2192'}
        </Link>
      </div>
      <Field label="Title">
        <input className={inputCls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
      </Field>
      <Field label="Banner text (top-of-page CTA, defaults to 'WIN BIG')">
        <input className={inputCls} value={form.banner_text} onChange={(e) => setForm((f) => ({ ...f, banner_text: e.target.value }))} placeholder="WIN BIG" />
      </Field>
      <Field label="Subtitle">
        <textarea className={inputCls} rows={2} value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />
      </Field>
      <Field label="Asterisk note (small grey footer)">
        <textarea className={inputCls} rows={2} value={form.asterisk_text} onChange={(e) => setForm((f) => ({ ...f, asterisk_text: e.target.value }))} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
        Active (the WIN BIG button appears once you save with this on)
      </label>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Questions ({questions.length})</p>
        {questions.length > 0 && (
          <ul className="space-y-2">
            {questions.map((q) => (
              <QuestionRow key={q.id} question={q} onChanged={refreshQuestions} />
            ))}
          </ul>
        )}
        <NewQuestionButton surveyId={survey.id} onCreated={refreshQuestions} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-between">
        <button onClick={deleteSurvey} disabled={busy} className="text-sm text-neutral-400 hover:text-red-600">
          Delete survey
        </button>
        <button onClick={saveSurvey} disabled={busy} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-40">
          {busy ? 'Saving...' : 'Save survey'}
        </button>
      </div>
    </div>
  );
}

function QuestionRow({ question, onChanged }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-neutral-200 bg-neutral-50">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 p-2 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{question.question_text || <span className="italic text-neutral-400">(no text)</span>}</p>
          <p className="text-xs text-neutral-500">
            {question.question_type}
            {question.is_required ? ' \u00b7 required' : ''}
          </p>
        </div>
        <span className="text-neutral-400">{open ? '\u2212' : '+'}</span>
      </button>
      {open && <QuestionEditor question={question} onChanged={onChanged} />}
    </li>
  );
}

function QuestionEditor({ question, onChanged }) {
  const [form, setForm] = useState({
    question_text: question.question_text,
    question_type: question.question_type,
    options_text: optionsToText(question.options, question.question_type),
    is_required: question.is_required,
    sort_order: String(question.sort_order),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      await api.admin.updateQuestion(question.id, {
        question_text: form.question_text,
        question_type: form.question_type,
        options: textToOptions(form.options_text, form.question_type),
        is_required: form.is_required,
        sort_order: parseInt(form.sort_order, 10) || 0,
      });
      await onChanged();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm('Delete this question?')) return;
    setBusy(true); setError(null);
    try {
      await api.admin.deleteQuestion(question.id);
      await onChanged();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const needsOptions = form.question_type === 'radio' || form.question_type === 'dropdown';

  return (
    <div className="space-y-2 border-t border-neutral-200 p-2">
      <Field label="Question text">
        <textarea className={inputCls} rows={2} value={form.question_text} onChange={(e) => setForm((f) => ({ ...f, question_text: e.target.value }))} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Type">
          <select className={inputCls} value={form.question_type} onChange={(e) => setForm((f) => ({ ...f, question_type: e.target.value }))}>
            <option value="text">Text</option>
            <option value="slider">Slider 0-10</option>
            <option value="radio">Radio buttons</option>
            <option value="dropdown">Dropdown</option>
          </select>
        </Field>
        <Field label="Sort order">
          <input className={inputCls} type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} />
        </Field>
      </div>
      {needsOptions && (
        <Field label="Options (one per line)">
          <textarea className={inputCls} rows={3} value={form.options_text} onChange={(e) => setForm((f) => ({ ...f, options_text: e.target.value }))} placeholder={'Yes\nNo\nMaybe'} />
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.is_required} onChange={(e) => setForm((f) => ({ ...f, is_required: e.target.checked }))} />
        Required
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-between">
        <button onClick={remove} disabled={busy} className="text-xs text-neutral-400 hover:text-red-600">Delete</button>
        <button onClick={save} disabled={busy} className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-40">
          {busy ? 'Saving...' : 'Save question'}
        </button>
      </div>
    </div>
  );
}

function NewQuestionButton({ surveyId, onCreated }) {
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    try {
      await api.admin.createQuestion(surveyId, {
        question_text: 'New question',
        question_type: 'text',
      });
      await onCreated();
    } catch (e) { console.error(e); }
    finally { setBusy(false); }
  }
  return (
    <button onClick={add} disabled={busy} className="block w-full rounded-lg border-2 border-dashed border-neutral-300 py-2 text-xs font-semibold text-neutral-500 hover:border-amber-500 hover:text-amber-700 disabled:opacity-50">
      + Add question
    </button>
  );
}

function NewSurveyForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    if (!title.trim()) return;
    setBusy(true); setError(null);
    try {
      await api.admin.createSurvey({ title: title.trim() });
      setTitle('');
      setOpen(false);
      await onCreated();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="block w-full rounded-xl border-2 border-dashed border-neutral-300 py-3 text-sm font-semibold text-neutral-500 hover:border-amber-500 hover:text-amber-700"
      >
        + New survey
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Survey title (e.g. Win a Trip to London with David)"
        className={inputCls}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => { setOpen(false); setTitle(''); }} className="rounded-md px-3 py-1 text-sm text-neutral-500">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy || !title.trim()}
          className="rounded-md bg-amber-600 px-3 py-1 text-sm font-semibold text-amber-900 disabled:opacity-40"
        >
          {busy ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  );
}
