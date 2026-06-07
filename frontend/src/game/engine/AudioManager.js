/**
 * AudioManager
 *
 * Synthesised SFX + background battle music — no audio files required.
 * AudioContext is created on first call (browser autoplay policy).
 *
 * Battle music structure (A minor, 162 BPM, 4-bar loop):
 *   Bar 1 — Cambridge bell-chime motif (ascending arpeggios, college carillon nod)
 *   Bar 2 — Battle charge theme
 *   Bar 3 — Flowing 16th-note run (punting-on-the-Cam feel)
 *   Bar 4 — Climax and resolution back to A
 */

// ─── Battle music note data ───────────────────────────────────────────────────

const BPM = 162;
const S16 = 60 / BPM / 4;   // one sixteenth-note in seconds (~0.0926 s)

// Frequencies (Hz) — A natural minor
const E2=82.4,  G2=98.0,  A2=110,  D3=146.8, E3=164.8;
const E4=329.6, G4=392,   A4=440,  B4=493.9;
const C5=523.3, D5=587.3, E5=659.3, G5=784,  A5=880;
const R = 0; // rest

// Each entry: [frequency_hz | R, duration_in_16ths]
const LEAD = [
  // Bar 1 — Cambridge bells: sparse ascending arpeggios
  [A5,1],[R,1],[E5,1],[R,1],  [C5,1],[R,1],[A4,1],[R,1],
  [E5,1],[C5,1],[A4,1],[G4,1],[A4,4],

  // Bar 2 — Charge! driving battle phrase
  [E5,1],[E5,1],[G5,1],[E5,1], [D5,1],[E5,1],[C5,1],[D5,1],
  [E5,2],[C5,1],[B4,1],        [A4,2],[B4,2],

  // Bar 3 — Flowing run (punting rhythm)
  [A4,1],[B4,1],[C5,1],[D5,1], [E5,1],[D5,1],[C5,1],[B4,1],
  [A4,1],[G4,1],[A4,1],[B4,1], [C5,4],

  // Bar 4 — Climax and resolve
  [E5,1],[G5,1],[A5,1],[G5,1], [E5,1],[D5,1],[E5,2],
  [G5,1],[E5,1],[D5,1],[C5,1], [A4,4],
];

const BASS = [
  // Bar 1
  [A2,4],[A2,4],[E3,4],[A2,4],
  // Bar 2
  [D3,4],[E3,4],[A2,4],[E3,4],
  // Bar 3
  [A2,4],[A2,4],[G2,4],[A2,4],
  // Bar 4
  [D3,4],[E3,4],[A2,2],[E2,2],[A2,4],
];

const KICK=-1, SNARE=-2;
const PERC = [
  [KICK,4],[SNARE,4],[KICK,4],[SNARE,4],
  [KICK,4],[SNARE,4],[KICK,4],[SNARE,4],
  [KICK,4],[SNARE,4],[KICK,4],[SNARE,4],
  [KICK,4],[SNARE,4],[KICK,4],[SNARE,4],
];

// ─── AudioManager class ───────────────────────────────────────────────────────

export class AudioManager {
  constructor() {
    this._ctx             = null;
    this._musicMasterGain = null;
    this._musicPlaying    = false;
    this._musicTimerId    = null;
    // Per-layer scheduling state
    this._leadIdx  = 0; this._leadTime  = 0;
    this._bassIdx  = 0; this._bassTime  = 0;
    this._percIdx  = 0; this._percTime  = 0;
  }

  // ── AudioContext ──────────────────────────────────────────────────────────────

  _getCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
    return this._ctx;
  }

  // ── SFX helpers ───────────────────────────────────────────────────────────────

  /** Pitched oscillator tone. */
  _tone({ type = 'sine', freq = 440, freqEnd = null, gainPeak = 0.3, duration = 0.1, start = 0 }) {
    try {
      const ctx = this._getCtx();
      const t   = ctx.currentTime + start;
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g);
      g.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (freqEnd != null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + duration);
      }
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gainPeak, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    } catch (_e) {}
  }

  /** White-noise burst. */
  _noise({ gainPeak = 0.25, duration = 0.08, start = 0, filterFreq = null }) {
    try {
      const ctx    = this._getCtx();
      const t      = ctx.currentTime + start;
      const bufLen = Math.ceil(ctx.sampleRate * duration);
      const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data   = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

      const src = ctx.createBufferSource();
      src.buffer = buf;
      let node = src;

      if (filterFreq != null) {
        const f       = ctx.createBiquadFilter();
        f.type        = 'bandpass';
        f.frequency.value = filterFreq;
        f.Q.value     = 1.5;
        src.connect(f);
        node = f;
      }

      const g = ctx.createGain();
      node.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(gainPeak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);
      src.start(t);
      src.stop(t + duration + 0.02);
    } catch (_e) {}
  }

  // ── Public SFX ────────────────────────────────────────────────────────────────

  playPunch() {
    this._noise({ gainPeak: 0.22, duration: 0.055, filterFreq: 800 });
    this._tone({ type: 'square', freq: 180, freqEnd: 70, gainPeak: 0.12, duration: 0.07 });
  }

  playKick() {
    this._noise({ gainPeak: 0.28, duration: 0.08, filterFreq: 300 });
    this._tone({ type: 'sine',   freq: 110, freqEnd: 45, gainPeak: 0.28, duration: 0.13 });
  }

  playSpecial() {
    this._noise({ gainPeak: 0.38, duration: 0.13 });
    this._tone({ type: 'sawtooth', freq: 380, freqEnd: 55,  gainPeak: 0.22, duration: 0.20 });
    this._tone({ type: 'sine',     freq: 900, freqEnd: 280, gainPeak: 0.14, duration: 0.14, start: 0.02 });
  }

  /** Piano attack instrument effect — A minor chord (A4, C5, E5). */
  playPianoHit() {
    // Percussion click (hammer hitting string)
    this._noise({ gainPeak: 0.14, duration: 0.04, filterFreq: 2200 });
    // Three-voice A minor chord — sine tones with piano-like decay
    const chord = [440, 523.3, 659.3]; // A4, C5, E5
    chord.forEach((freq, i) => {
      this._tone({ type: 'sine',     freq,       gainPeak: 0.18, duration: 0.55, start: i * 0.007 });
      this._tone({ type: 'triangle', freq: freq * 2, gainPeak: 0.06, duration: 0.28, start: i * 0.007 });
    });
    // Low octave bass note
    this._tone({ type: 'sine', freq: 220, gainPeak: 0.14, duration: 0.40 });
  }

  /** Guitar attack instrument effect — E power chord (E3, B3, E4). */
  playGuitarHit() {
    // String attack transient
    this._noise({ gainPeak: 0.20, duration: 0.07, filterFreq: 700 });
    // Power chord — sawtooth for crunch
    const chord = [164.8, 246.9, 329.6]; // E3, B3, E4
    chord.forEach(freq => {
      this._tone({ type: 'sawtooth', freq, gainPeak: 0.12, duration: 0.35 });
    });
    // Low E thump
    this._tone({ type: 'sine', freq: 82.4, freqEnd: 40, gainPeak: 0.22, duration: 0.22 });
  }

  playBlock() {
    this._tone({ type: 'square', freq: 550, freqEnd: 420, gainPeak: 0.18, duration: 0.09 });
    this._noise({ gainPeak: 0.12, duration: 0.05, start: 0.01, filterFreq: 1200 });
  }

  playHurt() {
    this._tone({ type: 'sine', freq: 320, freqEnd: 160, gainPeak: 0.18, duration: 0.11 });
    this._noise({ gainPeak: 0.08, duration: 0.06 });
  }

  /** Convenience dispatcher called from CombatSystem. */
  play(type) {
    switch (type) {
      case 'punch':      this.playPunch();      break;
      case 'kick':       this.playKick();       break;
      case 'special':    this.playSpecial();    break;
      case 'piano_hit':  this.playPianoHit();   break;
      case 'guitar_hit': this.playGuitarHit();  break;
      case 'block':      this.playBlock();      break;
      case 'hurt':       this.playHurt();       break;
    }
  }

  // ── Battle music ──────────────────────────────────────────────────────────────

  startBattleMusic() {
    if (this._musicPlaying) return;
    const ctx = this._getCtx();

    // Master gain for the whole music mix (separate from SFX)
    this._musicMasterGain = ctx.createGain();
    this._musicMasterGain.gain.setValueAtTime(0, ctx.currentTime);
    this._musicMasterGain.gain.linearRampToValueAtTime(0.38, ctx.currentTime + 0.6);
    this._musicMasterGain.connect(ctx.destination);

    this._musicPlaying = true;
    const start = ctx.currentTime + 0.05;
    this._leadTime = start; this._leadIdx = 0;
    this._bassTime = start; this._bassIdx = 0;
    this._percTime = start; this._percIdx = 0;

    this._musicTick();
  }

  stopBattleMusic() {
    if (!this._musicPlaying) return;
    this._musicPlaying = false;
    clearTimeout(this._musicTimerId);

    if (this._musicMasterGain) {
      const ctx = this._getCtx();
      const g   = this._musicMasterGain;
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      setTimeout(() => { try { g.disconnect(); } catch (_e) {} }, 500);
      this._musicMasterGain = null;
    }
  }

  _musicTick() {
    if (!this._musicPlaying) return;
    const ctx    = this._getCtx();
    const LOOK   = 0.2; // schedule notes up to 200 ms ahead

    // ── Lead melody ──────────────────────────────────────────────────────────
    while (this._leadTime < ctx.currentTime + LOOK) {
      const [freq, dur16] = LEAD[this._leadIdx];
      const dur = dur16 * S16;
      if (freq > 0) {
        this._musicOsc(freq, this._leadTime, dur * 0.85, 'square', 0.048);
      }
      this._leadTime += dur;
      this._leadIdx = (this._leadIdx + 1) % LEAD.length;
    }

    // ── Bass line ────────────────────────────────────────────────────────────
    while (this._bassTime < ctx.currentTime + LOOK) {
      const [freq, dur16] = BASS[this._bassIdx];
      const dur = dur16 * S16;
      if (freq > 0) {
        this._musicOsc(freq, this._bassTime, dur * 0.88, 'triangle', 0.10);
      }
      this._bassTime += dur;
      this._bassIdx = (this._bassIdx + 1) % BASS.length;
    }

    // ── Percussion ───────────────────────────────────────────────────────────
    while (this._percTime < ctx.currentTime + LOOK) {
      const [type, dur16] = PERC[this._percIdx];
      const dur = dur16 * S16;
      if (type === KICK)  this._musicKick(this._percTime);
      if (type === SNARE) this._musicSnare(this._percTime);
      this._percTime += dur;
      this._percIdx = (this._percIdx + 1) % PERC.length;
    }

    this._musicTimerId = setTimeout(() => this._musicTick(), 20);
  }

  /** Schedule a music oscillator tone into the music master gain bus. */
  _musicOsc(freq, startTime, duration, type, gainPeak) {
    try {
      if (!this._musicMasterGain) return;
      const ctx = this._getCtx();
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g);
      g.connect(this._musicMasterGain);
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, startTime);
      g.gain.linearRampToValueAtTime(gainPeak, startTime + 0.008);
      g.gain.setValueAtTime(gainPeak, startTime + duration - 0.015);
      g.gain.linearRampToValueAtTime(0, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    } catch (_e) {}
  }

  /** Synthesised kick drum for music. */
  _musicKick(t) {
    try {
      if (!this._musicMasterGain) return;
      const ctx = this._getCtx();
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g);
      g.connect(this._musicMasterGain);
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.07);
      g.gain.setValueAtTime(0.24, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.start(t);
      osc.stop(t + 0.10);
    } catch (_e) {}
  }

  /** Synthesised snare for music. */
  _musicSnare(t) {
    try {
      if (!this._musicMasterGain) return;
      const ctx    = this._getCtx();
      const bufLen = Math.ceil(ctx.sampleRate * 0.12);
      const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data   = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = 1200;
      bpf.Q.value = 0.9;
      const g = ctx.createGain();
      src.connect(bpf);
      bpf.connect(g);
      g.connect(this._musicMasterGain);
      g.gain.setValueAtTime(0.07, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
      src.start(t);
      src.stop(t + 0.13);
    } catch (_e) {}
  }
}
