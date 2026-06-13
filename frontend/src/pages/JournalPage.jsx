import { Link } from 'react-router-dom';
import TimelineMilestonesEditor from '../components/timeline/TimelineMilestonesEditor.jsx';
import TimelinePageSettingsEditor from '../components/timeline/TimelinePageSettingsEditor.jsx';
import TimelineThemeEditor from '../components/timeline/TimelineThemeEditor.jsx';
import { TimelineThemeProvider } from '../components/timeline/timelineTheme.jsx';

/**
 * JournalPage
 * -----------
 * Dedicated, mobile-friendly page for managing the Relationship Timeline:
 * milestones (add/edit/reorder/delete/show-hide, with photo/gif upload),
 * the /timeline page heading, and the theme. Everything here is saved
 * server-side, so it applies on every device, not just the browser that
 * made the change.
 *
 * Access control: this route is matched by Caddy's @admin basicauth
 * (see caddy/Caddyfile — /journal /journal/* are listed alongside
 * /admin/* and /api/admin/*), so only David's credentials get past the
 * browser's auth prompt. The milestone CRUD + upload + settings endpoints
 * it calls already enforce requireAdmin() / @admin server-side too.
 */
export default function JournalPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Journal</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Manage the Relationship Timeline: milestones, heading text, and theme.
          </p>
        </div>
        <Link to="/timeline" className="shrink-0 text-sm font-medium text-amber-700 hover:text-amber-900">
          View timeline →
        </Link>
      </div>

      <TimelinePageSettingsEditor />

      <TimelineMilestonesEditor />

      <TimelineThemeProvider>
        <TimelineThemeEditor />
      </TimelineThemeProvider>
    </div>
  );
}
