const KATIE_FALLBACK = '00000000-0000-0000-0000-000000000001';

export function getEffectiveAccountId(req) {
  return req.user?.effectiveAccountId ?? KATIE_FALLBACK;
}

export function getActualAccountId(req) {
  return req.user?.actualAccountId ?? KATIE_FALLBACK;
}

// Which version of the world this request should see: 'adult' or 'kids'.
// Anonymous or unknown callers get the adult set, matching the old behaviour.
export function getAudience(req) {
  return req.user?.audience === 'kids' ? 'kids' : 'adult';
}

export function isAdmin(req) {
  return req.user?.actualRole === 'admin';
}
