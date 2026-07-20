import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';
import { useTheme } from '../lib/ThemeContext.jsx';
import { useScrolls } from '../components/scrolls/useScrolls.js';
import ScrollComposeModal from '../components/scrolls/ScrollComposeModal.jsx';
import ScrollsListModal from '../components/scrolls/ScrollsListModal.jsx';
import CrowAnimationLayer from '../components/scrolls/CrowAnimationLayer.jsx';
import ScrollBranch from '../components/scrolls/ScrollBranch.jsx';
import LandingPerch from '../components/scrolls/LandingPerch.jsx';
import OmwTestPanel from '../components/omw/OmwTestPanel.jsx';

/* /new-chat — a PRIVATE, admin-only test harness for the scrolls (raven message)
   feature. Deliberately a blank sandbox: it does NOT import, read, or write the
   live chat in any way, so nothing here can ever reach Katie. Every send is a
   self-looping simulation. When the feature is signed off, the scroll components
   (compose modal, list, animation layers, tray entry) get merged into the real
   MessagesPage and this page is removed. */
export default function NewChatPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const scrolls = useScrolls();

  const [composeOpen, setComposeOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [sendStage, setSendStage] = useState('idle'); // idle | intro | perched | flight
  const [landFlight, setLandFlight] = useState(false);
  // Quick-action / Siri deep link (/new-chat?omw=start) auto-starts an OMW trip.
  const [omwAutoStart, setOmwAutoStart] = useState(false);

  // Deep-link from the arrival push (/new-chat?scrolls=1) opens the list.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('scrolls') === '1') setListOpen(true);
    if (p.get('omw') === 'start') setOmwAutoStart(true);
  }, []);

  // A freshly-arrived crow plays the landing fly-in once; the persistent perch
  // (driven by unread count) takes over when it finishes.
  useEffect(() => {
    if (scrolls.arrivedTick > 0) setLandFlight(true);
  }, [scrolls.arrivedTick]);

  // Admin-only. actual_role survives impersonation, so it stays locked to you.
  if (!(user?.actual_role === 'admin' || user?.role === 'admin')) {
    return <Navigate to="/" replace />;
  }

  const settings = scrolls.config.settings || {};
  const fps = settings.frame_rate_fps || 12;
  const dark = theme === 'dark';
  const card = dark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200';

  // The perched crow uses the final landing frame's sprite.
  const landFrames = scrolls.config.land || [];
  const landLast = landFrames[landFrames.length - 1];
  const landCrowFile = landLast?.sprite_file || 'crow_land_10.png';
  const landCrowX = landLast?.x ?? 88;
  const landCrowY = landLast?.y ?? 50;
  const landCrowScale = Number(landLast?.scale) || 1;

  // Memoise the frame slices so the animation layer doesn't restart on every
  // re-render. (Crow size is now driven purely by each frame's config scale —
  // send and land share the same base.)
  const introFrames = useMemo(() => (scrolls.config.send || []).slice(0, 3), [scrolls.config.send]);
  const flyoffFrames = useMemo(() => (scrolls.config.send || []).slice(2), [scrolls.config.send]);


  return (
    <>
      {/* ── Scroll feature overlays ── */}
      {composeOpen && (
        <ScrollComposeModal
          settings={settings}
          testMode
          onSend={(p) => scrolls.send({ ...p, simulate: true })}
          onSent={() => { setComposeOpen(false); setTimeout(() => setSendStage('flight'), 500); }}
          onClose={() => { setComposeOpen(false); setSendStage('idle'); }}
        />
      )}
      {listOpen && (
        <ScrollsListModal
          scrolls={scrolls.scrolls}
          settings={settings}
          onRead={scrolls.markRead}
          onClose={() => { setListOpen(false); scrolls.refresh(); }}
        />
      )}
      {/* Send branch is visible for the whole send sequence (intro → perch → fly-off). */}
      {sendStage !== 'idle' && (
        <ScrollBranch
          file={settings.send_branch_file}
          x={settings.send_branch_x}
          y={settings.send_branch_y}
          scale={settings.send_branch_scale}
          rotation={settings.send_branch_rotation}
          opacity={settings.send_branch_opacity}
        />
      )}

      {/* Intro: crow flies in and perches on the send branch (frames 00–02),
          pausing on 02; tapping it opens the compose modal. The perch stays
          (behind the modal) so the fly-off can continue seamlessly from 02. */}
      {/* Tap anywhere but the crow cancels the send. */}
      {(sendStage === 'intro' || sendStage === 'perched') && !composeOpen && (
        <div onClick={() => setSendStage('idle')} style={{ position: 'fixed', inset: 0, zIndex: 34 }} />
      )}
      {(sendStage === 'intro' || sendStage === 'perched') && (
        <CrowAnimationLayer
          frames={introFrames}
          fps={fps}
          playing={sendStage === 'intro'}
          perchOnEnd
          onComplete={() => setSendStage('perched')}
          onFinalTap={() => setComposeOpen(true)}
        />
      )}

      {/* Fly-off: continues from frame 02 through 12, 0.5s after SEAL. */}
      {sendStage === 'flight' && (
        <CrowAnimationLayer
          frames={flyoffFrames}
          fps={fps}
          playing
          onComplete={() => setSendStage('idle')}
        />
      )}
      {/* Landing: branch + crow. The branch shows whenever a crow is inbound or
          perched; the perched crow (locked to the branch) persists while there's
          an unread scroll, and the fly-in plays once on a fresh arrival. */}
      {(scrolls.unread > 0 || landFlight) && (
        <>
          <LandingPerch
            branchFile={settings.land_branch_file}
            crowFile={landCrowFile}
            x={settings.land_branch_x}
            y={settings.land_branch_y}
            scale={settings.land_branch_scale}
            rotation={settings.land_branch_rotation}
            opacity={settings.land_branch_opacity}
            crowX={landCrowX}
            crowY={landCrowY}
            crowScale={landCrowScale}
            showCrow={!landFlight}
            count={scrolls.unread}
            onTap={() => setListOpen(true)}
          />
          {landFlight && (
            <CrowAnimationLayer
              frames={scrolls.config.land}
              fps={fps}
              playing={landFlight}
              onComplete={() => setLandFlight(false)}
            />
          )}
        </>
      )}

      {/* ── Sandbox UI ── */}
      <div className="mx-auto max-w-lg space-y-5">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold leading-tight">Scrolls · Test Harness</h1>
            <p className="text-xs text-neutral-500">
              Private sandbox — only you can see this. Nothing here touches your real chat.
            </p>
          </div>
          <Link to="/messages" className="shrink-0 text-sm text-neutral-500">Back</Link>
        </header>

        <div className={`rounded-2xl border p-4 ${card}`}>
          <p className="text-sm text-neutral-500">
            Send a test scroll — it loops back to you only, then flies in and lands so you
            can run the whole journey end to end.
          </p>

          {/* Mock composer row mirroring the real chat's + media tray, so the
              scroll entry point looks/behaves exactly as it will once merged. */}
          <div className="mt-4 flex items-end gap-2">
            <button
              type="button"
              onClick={() => setTrayOpen((o) => !o)}
              aria-label="Open media tray"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xl leading-none transition active:scale-95 ${dark ? 'border-neutral-700 text-neutral-300' : 'border-neutral-200 text-neutral-500'}`}
            >
              {trayOpen ? '×' : '+'}
            </button>
            <div className={`flex-1 rounded-2xl border px-3 py-2 text-sm text-neutral-400 ${dark ? 'border-neutral-800' : 'border-neutral-200'}`}>
              (chat composer disabled in sandbox)
            </div>
          </div>

          {trayOpen && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setTrayOpen(false); setSendStage('intro'); }}
                title="Send a scroll"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-500 transition hover:border-amber-300 hover:text-amber-700 active:scale-95"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 4h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7" /><path d="M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2" />
                  <line x1="9.5" y1="9" x2="15" y2="9" /><line x1="9.5" y1="13" x2="15" y2="13" />
                </svg>
              </button>
              <span className="text-xs text-neutral-500">Scroll</span>
            </div>
          )}
        </div>

        <div className={`rounded-2xl border p-4 ${card}`}>
          <div className="flex items-center justify-between">
            <p className="text-sm">
              {scrolls.loading
                ? 'Loading scrolls…'
                : `${scrolls.scrolls.length} received · ${scrolls.unread} unread`}
            </p>
            <button
              type="button"
              onClick={() => setListOpen(true)}
              className="text-sm font-medium text-amber-700"
            >
              Open list
            </button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Tip: set <code>scrolls_settings.speed_multiplier</code> high so test crows arrive in seconds.
          </p>
        </div>

        {/* ── On My Way (below the scrolls area) ── */}
        <OmwTestPanel dark={dark} autoStart={omwAutoStart} />
      </div>
    </>
  );
}
