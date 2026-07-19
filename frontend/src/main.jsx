import { StrictMode, Suspense, lazy, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import App from './App.jsx';
import { initNativePush } from './lib/nativePush.js';
import { enableCrowPush } from './lib/crowActivity.js';
import { syncWidgetCredentials } from './lib/widgetBridge.js';

// ── Eager — the core shell + everyday pages (kept small) ─────────────────────
import HomePage from './pages/HomePage.jsx';
import GamesPage from './pages/GamesPage.jsx';
import ProductPage from './pages/ProductPage.jsx';
import BasketPage from './pages/BasketPage.jsx';
import OrderConfirmationPage from './pages/OrderConfirmationPage.jsx';
import AccountPage from './pages/AccountPage.jsx';
import OrdersListPage from './pages/OrdersListPage.jsx';
import PointsHistoryPage from './pages/PointsHistoryPage.jsx';
import RewardsPage from './pages/RewardsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MessagesPage from './pages/MessagesPage.jsx';
import NewChatPage from './pages/NewChatPage.jsx';
import SheetIn from './components/SheetIn.jsx';
import ScrollToTop from './components/ScrollToTop.jsx';

// ── Lazy — heavy feature bundles, fetched only when their route is opened.
// The games carry three.js / react-three-fiber / rapier; Notes carries
// TipTap; Sheets carries Handsontable; SneakyTime carries the 3D rain.
// Splitting these slashes the initial download and parse cost.
const TruthOrDarePage      = lazy(() => import('./pages/TruthOrDarePage.jsx'));
const TicTacFacePage       = lazy(() => import('./pages/TicTacFacePage.jsx'));
const GiftsweeperPage      = lazy(() => import('./pages/GiftsweeperPage.jsx'));
const WheelOfMisfortunePage = lazy(() => import('./pages/WheelOfMisfortunePage.jsx'));
const WheelOfEntertainmentPage = lazy(() => import('./pages/WheelOfEntertainmentPage.jsx'));
const ShutTheBox15Page     = lazy(() => import('./pages/ShutTheBox15Page.jsx'));
const Magic8BallPage       = lazy(() => import('./pages/Magic8BallPage.jsx'));
const DuckyDerbyPage       = lazy(() => import('./pages/DuckyDerbyPage.jsx'));
const GameContainer        = lazy(() => import('./game/GameContainer.jsx'));
const DirtyWordlePage      = lazy(() => import('./pages/DirtyWordlePage.jsx'));
const PlinkoPage           = lazy(() => import('./pages/PlinkoPage.jsx'));
const JustSayTheWordPage   = lazy(() => import('./pages/JustSayTheWordPage.jsx'));
const RewatchListPage      = lazy(() => import('./pages/RewatchListPage.jsx'));
const RewatchDetailPage    = lazy(() => import('./pages/RewatchDetailPage.jsx'));
const PlaylistPage         = lazy(() => import('./pages/PlaylistPage.jsx'));
const PlaylistDetailPage   = lazy(() => import('./pages/PlaylistDetailPage.jsx'));
const CalendarPage         = lazy(() => import('./pages/CalendarPage.jsx'));
const SneakyFeedPage       = lazy(() => import('./pages/SneakyFeedPage.jsx'));
const SneakyStorePage      = lazy(() => import('./pages/SneakyStorePage.jsx'));
const NotesPage            = lazy(() => import('./pages/NotesPage.jsx'));
const SneakyCallsPage      = lazy(() => import('./pages/SneakyCallsPage.jsx'));
const ShoppingListPage     = lazy(() => import('./pages/ShoppingListPage.jsx'));
const SneakySpreadsheetsPage = lazy(() => import('./pages/SneakySpreadsheetsPage.jsx'));
const AdminPage            = lazy(() => import('./pages/AdminPage.jsx'));
const AdminSurveyResponsesPage = lazy(() => import('./pages/AdminSurveyResponsesPage.jsx'));
const RelationshipTimelinePage = lazy(() => import('./pages/RelationshipTimelinePage.jsx'));
const JournalPage          = lazy(() => import('./pages/JournalPage.jsx'));
const AdminStoragePage     = lazy(() => import('./pages/AdminStoragePage.jsx'));
const SneakyReadsPage      = lazy(() => import('./pages/SneakyReadsPage.jsx'));
const SneakyReadDetailPage = lazy(() => import('./pages/SneakyReadDetailPage.jsx'));
const SneakyscapesPage     = lazy(() => import('./pages/SneakyscapesPage.jsx'));
const SecretStoryPage      = lazy(() => import('./pages/SecretStoryPage.jsx'));
const NfcSlotPage          = lazy(() => import('./pages/NfcSlotPage.jsx'));
const CrossWordsPage       = lazy(() => import('./pages/CrossWordsPage.jsx'));

import { BasketProvider } from './lib/BasketContext.jsx';
import { SettingsProvider } from './lib/SettingsContext.jsx';
import { AuthProvider, useAuth } from './lib/AuthContext.jsx';
import { ThemeProvider } from './lib/ThemeContext.jsx';
import { ToastProvider } from './lib/ToastContext.jsx';
import ToastHost from './components/ToastHost.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

// Vite fires this on the window when a lazily-imported chunk's <link rel=
// modulepreload> fails — typically a stale chunk after a new deploy. Reload
// once (guarded) to pull the fresh build rather than leaving a dead route.
const PRELOAD_RELOAD_KEY = 'sneaky:preload-reload-at';
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  let last = 0;
  try { last = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY) || 0); } catch { /* ignore */ }
  if (Date.now() - last > 10_000) {
    try { sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now())); } catch { /* ignore */ }
    window.location.reload();
  }
});

// Register the service worker (needed for web push notifications + offline
// shell). Check for a newer worker on load and whenever the tab is refocused,
// so a deployed update is picked up promptly instead of lingering for days.
//
// Skip entirely in the native shell: the bundle is already on-device (no
// offline shell needed) and a SW intercepting https://localhost requests
// fights with Capacitor's asset server. Native push will use APNs via
// @capacitor/push-notifications (phase 2), not the web-push SW.
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});
  });
}

// Registers the device for native iOS push once the user is logged in, and
// deep-links into the app when a notification is tapped. No-op on web.
function NativePush() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (user) { initNativePush((url) => navigate(url)); enableCrowPush(); syncWidgetCredentials(); }
  }, [user, navigate]);
  return null;
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">
        Loading...
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return children;
}

// Minimal, unobtrusive loader for lazily-loaded routes (no skeleton screens).
const lazyFallback = (
  <div className="flex min-h-[50vh] items-center justify-center text-sm text-neutral-400">Loading…</div>
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* reducedMotion="user" makes every framer-motion transform/layout animation
        honour the OS "Reduce Motion" setting automatically — no per-component
        guards needed. Opacity fades are kept, so nothing disappears abruptly. */}
    <MotionConfig reducedMotion="user">
    <BrowserRouter>
      <ScrollToTop />
      <ToastProvider>
      <ToastHost />
      <ThemeProvider>
        <AuthProvider>
          <NativePush />
          <SettingsProvider>
          <ErrorBoundary>
          <Suspense fallback={lazyFallback}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <BasketProvider>
                    <App />
                  </BasketProvider>
                </RequireAuth>
              }
            >
              <Route index element={<HomePage />} />
              <Route path="product/:id" element={<ProductPage />} />
              <Route path="basket" element={<BasketPage />} />
              <Route path="order/:id" element={<OrderConfirmationPage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="messages" element={<SheetIn><MessagesPage /></SheetIn>} />
              {/* Scrolls feature dev clone — URL-only, admin-gated inside the
                  page, intentionally NOT linked in any menu. Merges into
                  /messages when tested. */}
              <Route path="new-chat" element={<NewChatPage />} />
              <Route path="games" element={<GamesPage />} />
              <Route path="games/truth-or-dare" element={<TruthOrDarePage />} />
              <Route path="games/tic-tac-face" element={<TicTacFacePage />} />
              <Route path="games/giftsweeper" element={<GiftsweeperPage />} />
              <Route path="games/wheel-of-misfortune" element={<WheelOfMisfortunePage />} />
              <Route path="games/wheel-of-entertainment" element={<WheelOfEntertainmentPage />} />
              <Route path="games/shut-the-box-15" element={<ShutTheBox15Page />} />
              <Route path="magic-8-ball" element={<Magic8BallPage />} />
              <Route path="games/ducky" element={<DuckyDerbyPage />} />
              <Route path="games/dirty-wordle" element={<DirtyWordlePage />} />
              {/* Plinko — admin-gated inside the page; URL-only, not in any menu yet. */}
              <Route path="plinko" element={<PlinkoPage />} />
              {/* Hidden / URL-only while in test — not linked in any menu. */}
              <Route path="justsaytheword" element={<JustSayTheWordPage />} />
              <Route path="games/streets-of-cambs-rage" element={<GameContainer />} />
              <Route path="games/beat-me-up" element={<Navigate to="/games/streets-of-cambs-rage" replace />} />
              <Route path="account/orders" element={<OrdersListPage />} />
              <Route path="account/points" element={<PointsHistoryPage />} />
              <Route path="account/rewards" element={<RewardsPage />} />
              <Route path="rewatch" element={<RewatchListPage />} />
              <Route path="rewatch/:id" element={<RewatchDetailPage />} />
              <Route path="sneaky-reads" element={<SneakyReadsPage />} />
              <Route path="sneaky-reads/:id" element={<SneakyReadDetailPage />} />
              <Route path="playlist" element={<PlaylistPage />} />
              <Route path="playlist/:id" element={<PlaylistDetailPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="stories" element={<SneakyFeedPage />} />
              {/* Hidden story deep link — opened via shared link / NFC tag. */}
              <Route path="s/:token" element={<SecretStoryPage />} />
              {/* Reusable NFC slot — resolves to its currently-assigned story. */}
              <Route path="t/:slug" element={<NfcSlotPage />} />
              {/* Private crossword — admin-only, URL-only, not linked anywhere. */}
              <Route path="cross-words" element={<CrossWordsPage />} />
              <Route path="store" element={<SneakyStorePage />} />
              <Route path="notes" element={<NotesPage />} />
              <Route path="sneakytime" element={<SneakyCallsPage />} />
              <Route path="shopping-list" element={<ShoppingListPage />} />
              <Route path="sneakyspreadsheets" element={<SneakySpreadsheetsPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="admin/storage" element={<AdminStoragePage />} />
              <Route path="admin/surveys/:id/responses" element={<AdminSurveyResponsesPage />} />
              <Route path="timeline" element={<RelationshipTimelinePage />} />
              <Route path="journal" element={<JournalPage />} />
              {/* Sneakyscapes garden planner — URL-only, intentionally NOT linked in any menu */}
              <Route path="sneakyscapes" element={<SneakyscapesPage />} />
            </Route>
          </Routes>
          </Suspense>
          </ErrorBoundary>
          </SettingsProvider>
        </AuthProvider>
      </ThemeProvider>
      </ToastProvider>
    </BrowserRouter>
    </MotionConfig>
  </StrictMode>
);
