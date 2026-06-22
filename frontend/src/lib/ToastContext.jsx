import { createContext, useCallback, useContext, useRef, useState } from 'react';

// In-app toast notifications. A toast is a small tappable card; tapping it
// navigates to its `url`. Used to surface alerts (chat, game turns, etc.) while
// the app is in the foreground, where iOS push banners don't appear.

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  // Show a toast. { title, body, url }. Auto-dismisses after ~5s. Keeps at most
  // 3 on screen so a burst can't bury the UI.
  const showToast = useCallback(({ title, body, url }) => {
    const id = ++idRef.current;
    setToasts((list) => [...list, { id, title, body, url }].slice(-3));
    setTimeout(() => dismiss(id), 5000);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
