import { useEffect, useState } from 'react';
import { Settings, X } from 'lucide-react';
import RelationshipTimeline from '../components/timeline/RelationshipTimeline';
import TimelineThemeEditor from '../components/timeline/TimelineThemeEditor';
import { TimelineThemeProvider } from '../components/timeline/timelineTheme';
import { api } from '../lib/api';

/**
 * RelationshipTimelinePage
 * -------------------------
 * Demo/host page for the Relationship Milestone Tracker. Renders the
 * timeline with a floating "Theme" button that slides in the admin color
 * editor - both share theme state via TimelineThemeProvider, and edits
 * persist to localStorage so they survive reloads.
 *
 * Mount this at whatever route you like, e.g. /timeline.
 */
export default function RelationshipTimelinePage() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [milestones, setMilestones] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listTimelineMilestones()
      .then((data) => { if (!cancelled) setMilestones(data); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  return (
    <TimelineThemeProvider>
      <div className="relative">
        {error && (
          <div className="mx-auto max-w-3xl px-4 pt-6 text-sm text-rose-400">
            Couldn't load the timeline: {error}
          </div>
        )}
        {milestones && <RelationshipTimeline milestones={milestones} />}

        <button
          type="button"
          onClick={() => setEditorOpen((v) => !v)}
          aria-label={editorOpen ? 'Close theme editor' : 'Open theme editor'}
          className="fixed top-20 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--tl-control-bg)] border border-[var(--tl-control-border)] text-[var(--tl-body)] hover:text-[var(--tl-accent)] shadow-lg transition-colors"
        >
          {editorOpen ? <X className="h-5 w-5" /> : <Settings className="h-5 w-5" />}
        </button>

        {editorOpen && (
          <div className="fixed top-32 right-4 z-50 w-[min(92vw,22rem)] max-h-[80vh] overflow-y-auto shadow-2xl">
            <TimelineThemeEditor />
          </div>
        )}
      </div>
    </TimelineThemeProvider>
  );
}
