import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function AdminSurveyResponsesPage() {
  const { id } = useParams();
  const [survey, setSurvey] = useState(null);
  const [responses, setResponses] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.admin.getSurvey(id).then(setSurvey).catch((e) => setError(e.message));
    api.admin.listSurveyResponses(id).then(setResponses).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!survey) return <p className="text-sm text-neutral-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="truncate text-xl font-semibold">{survey.title}</h1>
        <Link to="/admin" className="shrink-0 text-sm text-neutral-500">Back to admin</Link>
      </div>
      <p className="text-sm text-neutral-500">
        {responses === null ? 'Loading responses...' : `${responses.length} response${responses.length === 1 ? '' : 's'}`}
      </p>

      {responses && responses.length === 0 && (
        <p className="text-sm text-neutral-500">No responses yet.</p>
      )}

      {responses && responses.length > 0 && (
        <ul className="space-y-3">
          {responses.map((r) => (
            <li key={r.id} className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="text-xs text-neutral-500">{new Date(r.created_at).toLocaleString()}</p>
              <ul className="mt-3 space-y-3">
                {r.answers.map((a) => (
                  <li key={a.id}>
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{a.question_text}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">
                      {a.value || <span className="italic text-neutral-400">(no answer)</span>}
                    </p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
