import { useEffect, useState } from 'react';
import RelationshipTimeline from '../components/timeline/RelationshipTimeline';
import { TimelineThemeProvider } from '../components/timeline/timelineTheme';
import { api } from '../lib/api';

/**
 * RelationshipTimelinePage
 * -------------------------
 * Demo/host page for the Relationship Milestone Tracker. Theme is read from
 * TimelineThemeProvider (persisted to localStorage from the admin's
 * TimelineThemeEditor on /admin) - this page is read-only.
 *
 * Mount this at whatever route you like, e.g. /timeline.
 */
export default function RelationshipTimelinePage() {
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
      </div>
    </TimelineThemeProvider>
  );
}
