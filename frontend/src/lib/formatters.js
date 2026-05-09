// Pretty-print raw ledger reasons (e.g. "tic-tac-face:match-<uuid>")
// into something friendly for the user. Add new prefixes here as games
// arrive (wheel-of-misfortune, giftsweeper, etc).
export function formatLedgerReason(reason) {
  if (!reason || typeof reason !== 'string') return '';
  if (reason.startsWith('tic-tac-face:match-'))      return 'Tic-tac-face match award';
  if (reason.startsWith('wheel-of-misfortune:'))     return 'Wheel of Misfortune award';
  if (reason.startsWith('giftsweeper:'))             return 'Giftsweeper award';
  if (reason.startsWith('order:'))                   return 'Order purchase';
  if (reason.startsWith('admin:'))                   return 'Admin adjustment';
  return reason;
}
