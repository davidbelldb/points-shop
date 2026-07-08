import { registerPlugin, Capacitor } from '@capacitor/core';

// Native NFC writer (see ios/App/App/NfcPlugin.swift). iOS only.
const Nfc = registerPlugin('Nfc');

// Cheap synchronous gate for showing the button at all (native iOS shell).
export function nfcSupported() {
  return Capacitor.getPlatform() === 'ios';
}

// Whether this specific device actually has NFC reading/writing available.
export async function nfcAvailable() {
  if (!nfcSupported()) return false;
  try {
    const res = await Nfc.isAvailable();
    return !!res?.available;
  } catch {
    return false;
  }
}

// Opens the system NFC sheet; resolves once the tag is written. Rejects with
// "cancelled" if the user dismisses the sheet, or a message on failure.
export async function writeNfcUrl(url) {
  return Nfc.writeUrl({ url });
}
