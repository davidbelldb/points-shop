const KATIE_FALLBACK = '00000000-0000-0000-0000-000000000001';

export function getEffectiveAccountId(req) {
  return req.user?.effectiveAccountId ?? KATIE_FALLBACK;
}

export function getActualAccountId(req) {
  return req.user?.actualAccountId ?? KATIE_FALLBACK;
}

export function isAdmin(req) {
  return req.user?.actualRole === 'admin';
}
