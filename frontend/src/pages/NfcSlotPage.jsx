import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import StoryViewer from '../components/stories/StoryViewer.jsx';

/*
 * /t/:slug — a reusable NFC tag slot. Resolves to whatever story admin has
 * currently assigned to the slot (reassignable without rewriting the tag).
 * Opened in-app via the universal link when the tag is scanned.
 */
export default function NfcSlotPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, story: null });

  useEffect(() => {
    let cancelled = false;
    api.resolveNfcSlot(slug)
      .then((s) => { if (!cancelled) setState({ loading: false, story: s }); })
      .catch(() => { if (!cancelled) setState({ loading: false, story: null }); });
    return () => { cancelled = true; };
  }, [slug]);

  if (state.loading) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black text-sm text-white/80">
        Loading…
      </div>
    );
  }

  if (!state.story) {
    return (
      <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white">
        <p className="text-lg font-semibold">Nothing here yet</p>
        <p className="text-sm text-white/70">This tag isn’t pointing at a story right now.</p>
        <button
          onClick={() => navigate('/')}
          className="mt-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold active:scale-95"
        >
          Go home
        </button>
      </div>
    );
  }

  return <StoryViewer stories={[state.story]} onClose={() => navigate('/')} />;
}
