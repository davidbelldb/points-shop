// Whole days from today until dateStr (a 'YYYY-MM-DD' string).
// 0 = today, negative = in the past, null = no/invalid date.
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

// Live countdown clock to midnight of the target date, formatted DD:HH:MM:SS.
// Returns null when there is no date, an invalid date, or the date has arrived.
export function countdownClock(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
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
