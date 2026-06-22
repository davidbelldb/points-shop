import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

// Returns the on-screen keyboard height (px) on the native shell, 0 otherwise.
// Driven by the Keyboard plugin's will-show/hide events so callers can lift
// content above the keyboard in lockstep with its animation.
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let showSub, hideSub;
    Keyboard.addListener('keyboardWillShow', (info) => setHeight(info?.keyboardHeight || 0))
      .then((h) => { showSub = h; }).catch(() => {});
    Keyboard.addListener('keyboardWillHide', () => setHeight(0))
      .then((h) => { hideSub = h; }).catch(() => {});
    return () => { showSub?.remove?.(); hideSub?.remove?.(); };
  }, []);

  return height;
}
