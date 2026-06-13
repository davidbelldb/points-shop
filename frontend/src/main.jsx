import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import App from './App.jsx';

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

// ── Lazy — heavy feature bundles, fetched only when their route is opened.
// The games carry three.js / react-three-fiber / rapier; Notes carries
// TipTap; Sheets carries Handsontable; SneakyTime carries the 3D rain.
// Splitting these slashes the initial download and parse cost.
const TruthOrDarePage      = lazy(() => import('./pages/TruthOrDarePage.jsx'));
const TicTacFacePage       = lazy(() => import('./pages/TicTacFacePage.jsx'));
const GiftsweeperPage      = lazy(() => import('./pages/GiftsweeperPage.jsx'));
const WheelOfMisfortunePage = lazy(() => import('./pages/WheelOfMisfortunePage.jsx'));
const ShutTheBox15Page     = lazy(() => import('./pages/ShutTheBox15Page.jsx'));
const Magic8BallPage       = lazy(() => import('./pages/Magic8BallPage.jsx'));
const DuckyDerbyPage       = lazy(() => import('./pages/DuckyDerbyPage.jsx'));
const GameContainer        = lazy(() => import('./game/GameContainer.jsx'));
const DirtyWordlePage      = lazy(() => import('./pages/DirtyWordlePage.jsx'));
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

import { BasketProvider } from './lib/BasketContext.jsx';
import { SettingsProvider } from './lib/SettingsContext.jsx';
import { AuthProvider, useAuth } from './lib/AuthContext.jsx';
import { ThemeProvider } from './lib/ThemeContext.jsx';
import './index.css';

// Register the service worker (needed for web push notifications).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
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

const lazyFallback = (
  <div className="flex min-h-[40vh] items-center justify-center text-sm text-neutral-500">
    Loading...
  </div>
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <SettingsProvider>
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
              <Route path="messages" element={<MessagesPage />} />
              <Route path="games" element={<GamesPage />} />
              <Route path="games/truth-or-dare" element={<TruthOrDarePage />} />
              <Route path="games/tic-tac-face" element={<TicTacFacePage />} />
              <Route path="games/giftsweeper" element={<GiftsweeperPage />} />
              <Route path="games/wheel-of-misfortune" element={<WheelOfMisfortunePage />} />
              <Route path="games/shut-the-box-15" element={<ShutTheBox15Page />} />
              <Route path="magic-8-ball" element={<Magic8BallPage />} />
              <Route path="games/ducky" element={<DuckyDerbyPage />} />
              <Route path="games/dirty-wordle" element={<DirtyWordlePage />} />
              <Route path="games/streets-of-cambs-rage" element={<GameContainer />} />
              <Route path="games/beat-me-up" element={<Navigate to="/games/streets-of-cambs-rage" replace />} />
              <Route path="account/orders" element={<OrdersListPage />} />
              <Route path="account/points" element={<PointsHistoryPage />} />
              <Route path="account/rewards" element={<RewardsPage />} />
              <Route path="rewatch" element={<RewatchListPage />} />
              <Route path="rewatch/:id" element={<RewatchDetailPage />} />
              <Route path="playlist" element={<PlaylistPage />} />
              <Route path="playlist/:id" element={<PlaylistDetailPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="stories" element={<SneakyFeedPage />} />
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
            </Route>
          </Routes>
          </Suspense>
          </SettingsProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
