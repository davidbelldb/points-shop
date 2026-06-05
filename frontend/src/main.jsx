import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import App from './App.jsx';
import HomePage from './pages/HomePage.jsx';
import GamesPage from './pages/GamesPage.jsx';
import ProductPage from './pages/ProductPage.jsx';
import BasketPage from './pages/BasketPage.jsx';
import OrderConfirmationPage from './pages/OrderConfirmationPage.jsx';
import AccountPage from './pages/AccountPage.jsx';
import OrdersListPage from './pages/OrdersListPage.jsx';
import PointsHistoryPage from './pages/PointsHistoryPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import AdminSurveyResponsesPage from './pages/AdminSurveyResponsesPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MessagesPage from './pages/MessagesPage.jsx';
import TruthOrDarePage from './pages/TruthOrDarePage.jsx';
import TicTacFacePage from './pages/TicTacFacePage.jsx';
import GiftsweeperPage from './pages/GiftsweeperPage.jsx';
import RewardsPage from './pages/RewardsPage.jsx';
import WheelOfMisfortunePage from './pages/WheelOfMisfortunePage.jsx';
import ShutTheBoxPage from './pages/ShutTheBoxPage.jsx';
import ShutTheBox15Page from './pages/ShutTheBox15Page.jsx';
import DuckyDerbyPage from './pages/DuckyDerbyPage.jsx';
import GameContainer from './game/GameContainer.jsx';
import RewatchListPage from './pages/RewatchListPage.jsx';
import RewatchDetailPage from './pages/RewatchDetailPage.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import SneakyFeedPage from './pages/SneakyFeedPage.jsx';
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <SettingsProvider>
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
              <Route path="games/shut-the-box" element={<ShutTheBoxPage />} />
              <Route path="games/shut-the-box-15" element={<ShutTheBox15Page />} />
              <Route path="games/ducky" element={<DuckyDerbyPage />} />
              <Route path="games/beat-me-up" element={<GameContainer />} />
              <Route path="account/orders" element={<OrdersListPage />} />
              <Route path="account/points" element={<PointsHistoryPage />} />
              <Route path="account/rewards" element={<RewardsPage />} />
              <Route path="rewatch" element={<RewatchListPage />} />
              <Route path="rewatch/:id" element={<RewatchDetailPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="stories" element={<SneakyFeedPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="admin/surveys/:id/responses" element={<AdminSurveyResponsesPage />} />
            </Route>
          </Routes>
          </SettingsProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
