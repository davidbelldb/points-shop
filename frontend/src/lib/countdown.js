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

// Short countdown suffix for the ribbon — null once the day has passed.
export function countdownLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null || d < 0) return null;
  if (d === 0) return 'Today!';
  if (d === 1) return 'Tomorrow!';
  return `${d} days to go`;
}
