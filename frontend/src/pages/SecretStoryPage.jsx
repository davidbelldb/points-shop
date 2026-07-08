import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import StoryViewer from '../components/stories/StoryViewer.jsx';

/*
 * /s/:token — opens a hidden ("link only") story. This is the target of the
 * shareable link and the NFC tag. On iOS with the app installed the universal
 * link lands here inside the app; in a browser it falls back to the web view.
 */
export default function SecretStoryPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, story: null });

  useEffect(() => {
    let cancelled = false;
    api.getSecretStory(token)
      .then((s) => { if (!cancelled) setState({ loading: false, story: s }); })
      .catch(() => { if (!cancelled) setState({ loading: false, story: null }); });
    return () => { cancelled = true; };
  }, [token]);

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
        <p className="text-lg font-semibold">Story not found</p>
        <p className="text-sm text-white/70">This hidden link is invalid or the story has been removed.</p>
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
