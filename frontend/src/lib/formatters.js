// Pretty-print raw ledger reasons (e.g. "tic-tac-face:match-<uuid>")
// into something friendly for the user. Add new prefixes here as games
// arrive (wheel-of-misfortune, giftsweeper, etc).
export function formatLedgerReason(reason) {
  if (!reason || typeof reason !== 'string') return '';
  if (reason.startsWith('tic-tac-face:match-'))      return 'Tic-tac-face match award';
  if (reason.startsWith('wheel-of-misfortune:spin-')) return 'Wheel of Misfortune';
  if (reason.startsWith('wheel-of-misfortune:'))     return 'Wheel of Misfortune award';
  if (reason.startsWith('giftsweeper:turn-'))         return 'Giftsweeper turn cost';
  if (reason.startsWith('giftsweeper:'))             return 'Giftsweeper award';
  if (reason.startsWith('shut-the-box:win-'))         return "Shut Katie's Box - shut!";
  if (reason.startsWith('shut-the-box:'))             return "Shut Katie's Box";
  if (reason.startsWith('ducky:stake-'))              return 'Ducky Derby bet';
  if (reason.startsWith('ducky:win-'))                return 'Ducky Derby win';
  if (reason.startsWith('cambs-rage:easy:'))          return 'Streets of Cambs-Rage — Easy win';
  if (reason.startsWith('cambs-rage:medium:'))        return 'Streets of Cambs-Rage — Medium win';
  if (reason.startsWith('cambs-rage:hard:'))          return 'Streets of Cambs-Rage — Good Luck win';
  if (reason.startsWith('cambs-rage:'))               return 'Streets of Cambs-Rage win';
  if (reason.startsWith('order:'))                   return 'Order purchase';
  if (reason.startsWith('admin:'))                   return 'Admin adjustment';
  return reason;
}
