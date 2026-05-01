import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({});
  const refresh = useCallback(async () => {
    try { setSettings(await api.getSettings()); } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return (
    <SettingsContext.Provider value={{ settings, refresh }}>{children}</SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
