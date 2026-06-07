/**
 * AudioManager
 *
 * Synthesised sound effects via Web Audio API — no audio files needed.
 * AudioContext is created on first call to satisfy browser autoplay policy.
 */

export class AudioManager {
  constructor() {
    this._ctx = null;
  }

  _getCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended (autoplay policy)
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
    return this._ctx;
  }

  /** Synthesise a pitched tone. */
  _tone({ type = 'sine', freq = 440, freqEnd = null, gainPeak = 0.3, duration = 0.1, start = 0 }) {
    try {
      const ctx = this._getCtx();
      const t = ctx.currentTime + start;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (freqEnd != null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + duration);
      }
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(gainPeak, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    } catch (_e) { /* AudioContext not available */ }
  }

  /** Synthesise a burst of white noise. */
  _noise({ gainPeak = 0.25, duration = 0.08, start = 0, filterFreq = null }) {
    try {
      const ctx = this._getCtx();
      const t      = ctx.currentTime + start;
      const bufLen = Math.ceil(ctx.sampleRate * duration);
      const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data   = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

      const src  = ctx.createBufferSource();
      src.buffer = buf;

      let node = src;

      if (filterFreq != null) {
        const bpf        = ctx.createBiquadFilter();
        bpf.type         = 'bandpass';
        bpf.frequency.value = filterFreq;
        bpf.Q.value      = 1.5;
        src.connect(bpf);
        node = bpf;
      }

      const gain = ctx.createGain();
      node.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(gainPeak, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      src.start(t);
      src.stop(t + duration + 0.02);
    } catch (_e) { /* AudioContext not available */ }
  }

  // ── Public SFX ───────────────────────────────────────────────────────────────

  playPunch() {
    // Short sharp thwack — noise burst + low punch body
    this._noise({ gainPeak: 0.22, duration: 0.055, filterFreq: 800 });
    this._tone({ type: 'square', freq: 180, freqEnd: 70, gainPeak: 0.12, duration: 0.07 });
  }

  playKick() {
    // Heavier thud — more bass
    this._noise({ gainPeak: 0.28, duration: 0.08, filterFreq: 300 });
    this._tone({ type: 'sine',   freq: 110, freqEnd: 45, gainPeak: 0.28, duration: 0.13 });
  }

  playSpecial() {
    // Heavy impact — large noise burst + descending sweep + high crack
    this._noise({ gainPeak: 0.38, duration: 0.13 });
    this._tone({ type: 'sawtooth', freq: 380, freqEnd: 55,  gainPeak: 0.22, duration: 0.20 });
    this._tone({ type: 'sine',     freq: 900, freqEnd: 280, gainPeak: 0.14, duration: 0.14, start: 0.02 });
  }

  playBlock() {
    // Metallic clang — mid-tone short burst
    this._tone({ type: 'square', freq: 550, freqEnd: 420, gainPeak: 0.18, duration: 0.09 });
    this._noise({ gainPeak: 0.12, duration: 0.05, start: 0.01, filterFreq: 1200 });
  }

  playHurt() {
    // Short pain grunt — descending sine whimper
    this._tone({ type: 'sine', freq: 320, freqEnd: 160, gainPeak: 0.18, duration: 0.11 });
    this._noise({ gainPeak: 0.08, duration: 0.06 });
  }

  /** Convenience dispatcher — called from CombatSystem. */
  play(type) {
    switch (type) {
      case 'punch':   this.playPunch();   break;
      case 'kick':    this.playKick();    break;
      case 'special': this.playSpecial(); break;
      case 'block':   this.playBlock();   break;
      case 'hurt':    this.playHurt();    break;
    }
  }
}
