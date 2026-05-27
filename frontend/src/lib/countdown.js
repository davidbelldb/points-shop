// Whole days from today until dateStr (a 'YYYY-MM-DD' string).
// 0 = today, negative = in the past, null = no/invalid date.
// We intentionally compare at midnight on both sides so the "X days to go"
// label flips at midnight regardless of any time-of-day on the target.
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

// Live countdown clock formatted DD:HH:MM:SS. Targets dateStr at timeStr
// ('HH:MM', local time). If timeStr is omitted or invalid, defaults to
// midnight at the start of the target day. Returns null when there is no
// date, an invalid date, or the moment has already passed.
export function countdownClock(dateStr, timeStr) {
  if (!dateStr) return null;
  const time = sanitiseTime(timeStr);
  const target = new Date(`${dateStr}T${time}:00`);
  if (Number.isNaN(target.getTime())) return null;
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(days)}:${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

// Accept 'HH:MM' or 'HH:MM:SS'; fall back to '00:00' for anything else.
function sanitiseTime(t) {
  if (typeof t !== 'string') return '00:00';
  const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return '00:00';
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const mm = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
