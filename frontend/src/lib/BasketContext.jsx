import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { getBootstrap } from './bootstrap.js';

const BasketContext = createContext(null);

export function BasketProvider({ children }) {
  const [basket, setBasket] = useState(null);
  const [account, setAccount] = useState(null);
  const [notifications, setNotifications] = useState({ items: [], unread_count: 0 });
  // Unread scrolls live in a separate system; we surface their count here so the
  // header/menu bubble can show a single combined total (chat messages + game
  // turns already arrive as notifications, so they're in unread_count already).
  const [scrollUnread, setScrollUnread] = useState(0);

  const refreshScrollUnread = useCallback(async () => {
    try { const { unread } = await api.scrolls.unread(); setScrollUnread(unread ?? 0); }
    catch { /* logged out / transient */ }
  }, []);

  const refresh = useCallback(async () => {
    const [b, a, n] = await Promise.all([api.getBasket(), api.getAccount(), api.getNotifications()]);
    setBasket(b);
    setAccount(a);
    setNotifications(n);
    refreshScrollUnread();
  }, [refreshScrollUnread]);

  useEffect(() => {
    (async () => {
      const boot = await getBootstrap();
      if (boot?.account || boot?.basket) {
        setBasket(boot.basket);
        setAccount(boot.account);
        setNotifications(boot.notifications ?? { items: [], unread_count: 0 });
        refreshScrollUnread();
      } else {
        refresh().catch(console.error);
      }
    })();
  }, [refresh, refreshScrollUnread]);

  // Keep the scroll count fresh so the bubble updates as crows land. Also listen
  // for an explicit refresh (the incoming-crow toast fires this the moment a
  // crow lands) so the bubble updates instantly rather than on the next poll.
  useEffect(() => {
    const id = setInterval(refreshScrollUnread, 20000);
    window.addEventListener('scrolls:refresh', refreshScrollUnread);
    return () => { clearInterval(id); window.removeEventListener('scrolls:refresh', refreshScrollUnread); };
  }, [refreshScrollUnread]);

  // Single combined badge total for the header + side menu.
  const badgeCount = (notifications?.unread_count ?? 0) + scrollUnread;

  const addItem      = useCallback(async (id, qty = 1) => { const b = await api.addToBasket(id, qty); setBasket(b); return b; }, []);
  const setItemQty   = useCallback(async (id, qty)     => { const b = await api.setBasketItemQty(id, qty); setBasket(b); return b; }, []);
  const removeItem   = useCallback(async (id)          => { const b = await api.removeBasketItem(id); setBasket(b); return b; }, []);
  const applyPromo   = useCallback(async (code)        => { const b = await api.applyPromo(code); setBasket(b); return b; }, []);
  const removePromo  = useCallback(async ()            => { const b = await api.removePromo(); setBasket(b); return b; }, []);
  const setDelivery  = useCallback(async (id)          => { const b = await api.setBasketDelivery(id); setBasket(b); return b; }, []);
  const setNotes     = useCallback(async (notes)       => { const b = await api.setBasketNotes(notes); setBasket(b); return b; }, []);
  const dismissNotification = useCallback(async (id) => {
    setNotifications((prev) => ({
      items: prev.items.filter((n) => n.id !== id),
      unread_count: Math.max(0, prev.unread_count - (prev.items.find((n) => n.id === id && !n.read_at) ? 1 : 0)),
    }));
    try { await api.dismissNotification(id); }
    catch (e) { console.error(e); try { setNotifications(await api.getNotifications()); } catch {} }
  }, []);

  const clearAllNotifications = useCallback(async () => {
    const previous = notifications;
    setNotifications({ items: [], unread_count: 0 });
    try { await api.clearAllNotifications(); }
    catch (e) { console.error(e); setNotifications(previous); }
  }, [notifications]);

  const markNotificationsRead = useCallback(async () => {
    try {
      await api.markNotificationsRead();
      const n = await api.getNotifications();
      setNotifications(n);
    } catch (e) { console.error(e); }
  }, []);

  const placeOrder   = useCallback(async () => {
    const order = await api.placeOrder();
    await refresh();
    return order;
  }, [refresh]);

  return (
    <BasketContext.Provider
      value={{ basket, account, notifications, scrollUnread, badgeCount, refreshScrollUnread, refresh, addItem, setItemQty, removeItem, applyPromo, removePromo, setDelivery, setNotes, placeOrder, markNotificationsRead, dismissNotification, clearAllNotifications }}
    >
      {children}
    </BasketContext.Provider>
  );
}

export function useBasket() {
  const ctx = useContext(BasketContext);
  if (!ctx) throw new Error('useBasket must be used within BasketProvider');
  return ctx;
}
