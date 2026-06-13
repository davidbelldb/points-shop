import { useEffect, useState } from 'react';
import RelationshipTimeline from '../components/timeline/RelationshipTimeline';
import { TimelineThemeProvider } from '../components/timeline/timelineTheme';
import { api } from '../lib/api';

/**
 * RelationshipTimelinePage
 * -------------------------
 * Host page for the Relationship Milestone Tracker. Theme, page title, and
 * subtitle are all managed from /journal and persisted server-side via the
 * generic `settings` table, so they apply on every device.
 *
 * Mount this at whatever route you like, e.g. /timeline.
 */
export default function RelationshipTimelinePage() {
  const [milestones, setMilestones] = useState(null);
  const [error, setError] = useState(null);
  const [pageSettings, setPageSettings] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listTimelineMilestones()
      .then((data) => { if (!cancelled) setMilestones(data); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    api
      .getSettings()
      .then((settings) => {
        if (cancelled) return;
        const lat = parseFloat(settings?.timeline_map_center_lat);
        const lng = parseFloat(settings?.timeline_map_center_lng);
        const zoom = parseFloat(settings?.timeline_map_zoom);
        setPageSettings({
          title: settings?.timeline_title || undefined,
          subtitle: settings?.timeline_subtitle || undefined,
          mapCenter: Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : undefined,
          mapZoom: Number.isFinite(zoom) ? zoom : undefined,
        });
      })
      .catch(() => { if (!cancelled) setPageSettings({}); });
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
        {milestones && (
          <RelationshipTimeline
            milestones={milestones}
            title={pageSettings?.title}
            subtitle={pageSettings?.subtitle}
            mapCenter={pageSettings?.mapCenter}
            mapZoom={pageSettings?.mapZoom}
          />
        )}
      </div>
    </TimelineThemeProvider>
  );
}
