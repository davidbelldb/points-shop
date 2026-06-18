import { Component } from 'react';

/* App-wide error boundary.

   Its main job is to stop the "blank grey screen" failure mode: when a new
   version is deployed, an already-open tab still references the OLD hashed
   chunk filenames. Opening a lazy route then tries to dynamically import a
   chunk that no longer exists on the server → the import throws during render
   → with no boundary the whole React tree unmounts and the user is left with a
   blank page they can only escape by force-quitting the app.

   We detect that class of error and reload ONCE (guarded against reload loops)
   so the browser fetches the fresh index.html + current chunk names. Any other
   render error shows a friendly "reload" panel instead of a blank screen. */

const RELOAD_KEY = 'sneaky:chunk-reload-at';
const RELOAD_WINDOW_MS = 10_000;

// Matches the various ways browsers report a failed dynamic import:
//  - Chrome/Vite: "Failed to fetch dynamically imported module" / "error loading dynamically imported module"
//  - Safari:      "Importing a module script failed." and the generic "Load failed"
//  - Webpack-style ChunkLoadError (belt and braces)
function isChunkError(err) {
  if (!err) return false;
  if (err.name === 'ChunkLoadError') return true;
  const msg = err.message || String(err);
  return /dynamically imported module|module script failed|ChunkLoadError|importing a module|Load failed/i.test(msg);
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, reloading: false };
  }

  static getDerivedStateFromError(error) {
    return { error, reloading: isChunkError(error) };
  }

  componentDidCatch(error) {
    if (!isChunkError(error)) return;
    // Reload at most once per RELOAD_WINDOW_MS so a genuinely broken deploy
    // can't trap the user in an infinite reload loop.
    let last = 0;
    try { last = Number(sessionStorage.getItem(RELOAD_KEY) || 0); } catch { /* private mode */ }
    if (Date.now() - last > RELOAD_WINDOW_MS) {
      try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* ignore */ }
      window.location.reload();
    } else {
      // Already tried reloading recently — show the manual panel instead.
      this.setState({ reloading: false });
    }
  }

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;

    if (reloading) {
      // Reload is in flight — show a calm placeholder, not an error flash.
      return (
        <div className="flex min-h-[60vh] items-center justify-center px-6 text-center text-sm text-neutral-500">
          Updating to the latest version…
        </div>
      );
    }

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-neutral-500">Something went wrong loading this page.</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-amber-600 px-5 py-2 text-sm font-semibold text-amber-950 active:scale-95"
        >
          Reload
        </button>
      </div>
    );
  }
}
