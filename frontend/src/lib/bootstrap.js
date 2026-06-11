/**
 * Shared cold-open bootstrap — one /api/bootstrap request feeds AuthContext,
 * SettingsContext and BasketContext on first mount instead of five separate
 * round-trips. The promise is shared so all three consumers ride the same
 * request; it's cleared on login/logout so nothing stale leaks across
 * sessions. Consumers fall back to their individual endpoints when a slice
 * is missing.
 */

import { api } from './api.js';

let promise = null;

export function getBootstrap() {
  if (!promise) {
    promise = api.bootstrap().catch(() => null);
  }
  return promise;
}

export function clearBootstrap() {
  promise = null;
}
