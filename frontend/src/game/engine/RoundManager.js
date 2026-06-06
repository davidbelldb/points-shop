/**
 * RoundManager
 *
 * Drives the best-of-3 match lifecycle:
 *
 *   countdown → fighting → round_end → (next round or match_end)
 *
 * Countdown sequence: 3 … 2 … 1 … FIGHT!
 * Each digit shows for 1 s; "FIGHT!" shows for 0.7 s.
 */

const DIGIT_DURATION = 1.0;   // seconds per countdown number
const FIGHT_DURATION = 0.7;   // seconds "FIGHT!" is shown
const ROUND_END_HOLD = 2.2;   // seconds before next round starts

export class RoundManager {
  constructor() {
    this.round   = 1;
    this.scores  = { player: 0, enemy: 0 };
    this.phase   = 'countdown';   // 'countdown'|'fighting'|'round_end'|'match_end'
    this.winner  = null;          // 'player' | 'enemy' | null

    this._digits      = [3, 2, 1, 0];  // 0 = "FIGHT!"
    this._digitIndex  = 0;
    this._phaseTimer  = DIGIT_DURATION;
    this._roundTimer  = 0;
  }

  // ── Read-only state the HUD needs ──────────────────────────────────────────

  /** Text to show centred on screen, or null if nothing. */
  get overlayText() {
    if (this.phase === 'countdown') {
      const d = this._digits[this._digitIndex];
      return d === 0 ? 'FIGHT!' : String(d);
    }
    if (this.phase === 'round_end') {
      return this.winner === 'player' ? 'K.O.!' : 'K.O.!';
    }
    if (this.phase === 'match_end') {
      return this.winner === 'player' ? 'KATIE WINS!' : 'DAVID WINS!';
    }
    return null;
  }

  get overlayStyle() {
    if (this.phase === 'countdown') {
      const d = this._digits[this._digitIndex];
      return d === 0 ? 'fight' : 'number';
    }
    return 'ko';
  }

  get isFighting() { return this.phase === 'fighting'; }
  get isOver()     { return this.phase === 'match_end'; }

  // ── Update ─────────────────────────────────────────────────────────────────

  update(dt, player, enemy) {
    switch (this.phase) {
      case 'countdown':  this._tickCountdown(dt);         break;
      case 'fighting':   this._checkKO(player, enemy);    break;
      case 'round_end':  this._tickRoundEnd(dt, player, enemy); break;
      default: break;
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _tickCountdown(dt) {
    this._phaseTimer -= dt;
    if (this._phaseTimer > 0) return;

    this._digitIndex++;
    if (this._digitIndex >= this._digits.length) {
      this.phase = 'fighting';
      return;
    }
    // Duration for this step
    const d = this._digits[this._digitIndex];
    this._phaseTimer = d === 0 ? FIGHT_DURATION : DIGIT_DURATION;
  }

  _checkKO(player, enemy) {
    if (player.isDead) this._endRound('enemy');
    else if (enemy.isDead) this._endRound('player');
  }

  _endRound(winner) {
    this.phase  = 'round_end';
    this.winner = winner;
    this.scores[winner]++;
    this._roundTimer = ROUND_END_HOLD;
  }

  _tickRoundEnd(dt, player, enemy) {
    this._roundTimer -= dt;
    if (this._roundTimer > 0) return;

    if (this.scores.player >= 2 || this.scores.enemy >= 2) {
      this.phase = 'match_end';
      return;
    }

    // Start next round
    this.round++;
    this.winner       = null;
    this._digitIndex  = 0;
    this._phaseTimer  = DIGIT_DURATION;
    this.phase        = 'countdown';
    player.resetForRound(200);
    enemy.resetForRound(620);
  }
}
