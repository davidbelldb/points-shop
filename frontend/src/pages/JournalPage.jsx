import { Link } from 'react-router-dom';
import TimelineMilestonesEditor from '../components/timeline/TimelineMilestonesEditor.jsx';

/**
 * JournalPage
 * -----------
 * Dedicated, mobile-friendly page for managing Relationship Timeline
 * milestones (add/edit/reorder/delete, with photo/gif upload).
 *
 * Access control: this route is matched by Caddy's @admin basicauth
 * (see caddy/Caddyfile — /journal /journal/* are listed alongside
 * /admin/* and /api/admin/*), so only David's credentials get past the
 * browser's auth prompt. The milestone CRUD + upload endpoints it calls
 * (/api/admin/timeline/milestones, /api/admin/upload) already enforce
 * requireAdmin() server-side too.
 */
export default function JournalPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Journal</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Add and edit Relationship Timeline milestones.
          </p>
        </div>
        <Link to="/timeline" className="shrink-0 text-sm font-medium text-amber-700 hover:text-amber-900">
          View timeline →
        </Link>
      </div>

      <TimelineMilestonesEditor />
    </div>
  );
}
