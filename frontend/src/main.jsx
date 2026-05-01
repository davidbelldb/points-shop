import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import HomePage from './pages/HomePage.jsx';
import ProductPage from './pages/ProductPage.jsx';
import BasketPage from './pages/BasketPage.jsx';
import OrderConfirmationPage from './pages/OrderConfirmationPage.jsx';
import AccountPage from './pages/AccountPage.jsx';
import OrdersListPage from './pages/OrdersListPage.jsx';
import PointsHistoryPage from './pages/PointsHistoryPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import { BasketProvider } from './lib/BasketContext.jsx';
import { SettingsProvider } from './lib/SettingsContext.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <SettingsProvider>
        <BasketProvider>
          <Routes>
            <Route path="/" element={<App />}>
              <Route index element={<HomePage />} />
              <Route path="product/:id" element={<ProductPage />} />
              <Route path="basket" element={<BasketPage />} />
              <Route path="order/:id" element={<OrderConfirmationPage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="account/orders" element={<OrdersListPage />} />
              <Route path="account/points" element={<PointsHistoryPage />} />
              <Route path="admin" element={<AdminPage />} />
            </Route>
          </Routes>
        </BasketProvider>
      </SettingsProvider>
    </BrowserRouter>
  </StrictMode>
);
