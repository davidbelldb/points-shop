import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const BasketContext = createContext(null);

export function BasketProvider({ children }) {
  const [basket, setBasket] = useState(null);
  const [account, setAccount] = useState(null);

  const refresh = useCallback(async () => {
    const [b, a] = await Promise.all([api.getBasket(), api.getAccount()]);
    setBasket(b);
    setAccount(a);
  }, []);

  useEffect(() => { refresh().catch(console.error); }, [refresh]);

  const addItem      = useCallback(async (id, qty = 1) => { const b = await api.addToBasket(id, qty); setBasket(b); return b; }, []);
  const setItemQty   = useCallback(async (id, qty)     => { const b = await api.setBasketItemQty(id, qty); setBasket(b); return b; }, []);
  const removeItem   = useCallback(async (id)          => { const b = await api.removeBasketItem(id); setBasket(b); return b; }, []);
  const applyPromo   = useCallback(async (code)        => { const b = await api.applyPromo(code); setBasket(b); return b; }, []);
  const removePromo  = useCallback(async ()            => { const b = await api.removePromo(); setBasket(b); return b; }, []);
  const setDelivery  = useCallback(async (id)          => { const b = await api.setBasketDelivery(id); setBasket(b); return b; }, []);
  const placeOrder   = useCallback(async () => {
    const order = await api.placeOrder();
    await refresh();
    return order;
  }, [refresh]);

  return (
    <BasketContext.Provider
      value={{ basket, account, refresh, addItem, setItemQty, removeItem, applyPromo, removePromo, setDelivery, placeOrder }}
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
