import { useState } from 'react';
import { Settings, X } from 'lucide-react';
import RelationshipTimeline from '../components/timeline/RelationshipTimeline';
import TimelineThemeEditor from '../components/timeline/TimelineThemeEditor';
import { TimelineThemeProvider } from '../components/timeline/timelineTheme';
import milestones from '../data/milestones';

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

  return (
    <TimelineThemeProvider>
      <div className="relative">
        <RelationshipTimeline milestones={milestones} />

        <button
          type="button"
          onClick={() => setEditorOpen((v) => !v)}
          aria-label={editorOpen ? 'Close theme editor' : 'Open theme editor'}
          className="fixed top-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--tl-control-bg)] border border-[var(--tl-control-border)] text-[var(--tl-body)] hover:text-[var(--tl-accent)] shadow-lg transition-colors"
        >
          {editorOpen ? <X className="h-5 w-5" /> : <Settings className="h-5 w-5" />}
        </button>

        {editorOpen && (
          <div className="fixed top-16 right-4 z-50 w-[min(92vw,22rem)] max-h-[80vh] overflow-y-auto shadow-2xl">
            <TimelineThemeEditor />
          </div>
        )}
      </div>
    </TimelineThemeProvider>
  );
}
