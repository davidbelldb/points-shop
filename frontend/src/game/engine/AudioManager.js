/**
 * AudioManager
 *
 * Synthesised SFX + background music — no audio files required.
 * AudioContext is created on first call (browser autoplay policy).
 *
 * Battle music (A minor, 162 BPM, 4-bar loop):
 *   Bar 1 — Cambridge bell-chime motif (ascending arpeggios)
 *   Bar 2 — Battle charge theme
 *   Bar 3 — Flowing 16th-note run (punting-on-the-Cam feel)
 *   Bar 4 — Climax and resolution
 *
 * Menu music (A minor, 112 BPM, 4-bar loop):
 *   Slower, majestic, atmospheric — Pokémon title-screen feel
 *   Sine-wave lead + triangle bass + soft hi-hat
 */

// ─── Shared frequencies (Hz) — A natural minor ────────────────────────────────

const E2=82.4, G2=98.0, A2=110, C3=130.8, D3=146.8, E3=164.8;
const E4=329.6, G4=392, A4=440, B4=493.9;
const C5=523.3, D5=587.3, E5=659.3, G5=784, A5=880;
const R = 0; // rest

// ─── Battle music note data (162 BPM) ─────────────────────────────────────────

const BPM  = 162;
const S16  = 60 / BPM / 4;   // one sixteenth-note (~0.0926 s)

// [frequency_hz | R, duration_in_16ths]
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
  [A2,4],[A2,4],[E3,4],[A2,4],  // Bar 1
  [D3,4],[E3,4],[A2,4],[E3,4],  // Bar 2
  [A2,4],[A2,4],[G2,4],[A2,4],  // Bar 3
  [D3,4],[E3,4],[A2,2],[E2,2],[A2,4], // Bar 4
];

const KICK=-1, SNARE=-2, HH_MARK=-3;
const PERC = [
  [KICK,4],[SNARE,4],[KICK,4],[SNARE,4],
  [KICK,4],[SNARE,4],[KICK,4],[SNARE,4],
  [KICK,4],[SNARE,4],[KICK,4],[SNARE,4],
  [KICK,4],[SNARE,4],[KICK,4],[SNARE,4],
];

// ─── Menu music note data (112 BPM) ───────────────────────────────────────────

const MENU_BPM = 112;
const MS16     = 60 / MENU_BPM / 4;  // one sixteenth-note (~0.134 s)

// Stately A-minor melody with Cambridge character
const MENU_LEAD = [
  // Bar 1 — Stately opening
  [A4,4],[B4,2],[C5,2],  [E5,4],[D5,2],[C5,2],
  // Bar 2 — Ascending development
  [G4,4],[A4,4],         [B4,2],[C5,2],[D5,4],
  // Bar 3 — Expressive rise
  [E5,4],[R,2],[E5,2],   [G5,4],[E5,4],
  // Bar 4 — Graceful descent and resolve
  [D5,4],[C5,4],         [B4,4],[A4,4],
];

// Slow, sustaining bass harmonics
const MENU_BASS = [
  [A2,8],[E2,8],   // Bar 1 — tonic → fifth
  [C3,8],[G2,8],   // Bar 2 — relative major → sub-dominant
  [A2,8],[A2,8],   // Bar 3 — tonic drone
  [E2,8],[A2,8],   // Bar 4 — leading tone → home
];

// Soft quarter-note hi-hat (16 entries × 4 sixteenths = 64 total)
const MENU_HIHAT = Array.from({ length: 16 }, () => [HH_MARK, 4]);

// ─── AudioManager class ───────────────────────────────────────────────────────

export class AudioManager {
  constructor() {
    this._ctx = null;

    // Battle music state
    this._musicMasterGain = null;
    this._musicPlaying    = false;
    this._musicTimerId    = null;
    this._leadIdx  = 0; this._leadTime  = 0;
    this._bassIdx  = 0; this._bassTime  = 0;
    this._percIdx  = 0; this._percTime  = 0;

    // Menu music state
    this._menuMasterGain = null;
    this._menuPlaying    = false;
    this._menuTimerId    = null;
    this._menuLeadIdx  = 0; this._menuLeadTime  = 0;
    this._menuBassIdx  = 0; this._menuBassTime  = 0;
    this._menuHhIdx    = 0; this._menuHhTime    = 0;
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
        const f           = ctx.createBiquadFilter();
        f.type            = 'bandpass';
        f.frequency.value = filterFreq;
        f.Q.value         = 1.5;
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
    this._tone({ type: 'sine', freq: 110, freqEnd: 45, gainPeak: 0.28, duration: 0.13 });
  }

  playSpecial() {
    this._noise({ gainPeak: 0.38, duration: 0.13 });
    this._tone({ type: 'sawtooth', freq: 380, freqEnd: 55,  gainPeak: 0.22, duration: 0.20 });
    this._tone({ type: 'sine',     freq: 900, freqEnd: 280, gainPeak: 0.14, duration: 0.14, start: 0.02 });
  }

  /** Piano attack instrument effect — A minor chord (A4, C5, E5). */
  playPianoHit() {
    this._noise({ gainPeak: 0.14, duration: 0.04, filterFreq: 2200 });
    const chord = [440, 523.3, 659.3];
    chord.forEach((freq, i) => {
      this._tone({ type: 'sine',     freq,            gainPeak: 0.18, duration: 0.55, start: i * 0.007 });
      this._tone({ type: 'triangle', freq: freq * 2,  gainPeak: 0.06, duration: 0.28, start: i * 0.007 });
    });
    this._tone({ type: 'sine', freq: 220, gainPeak: 0.14, duration: 0.40 });
  }

  /** Guitar attack instrument effect — E power chord (E3, B3, E4). */
  playGuitarHit() {
    this._noise({ gainPeak: 0.20, duration: 0.07, filterFreq: 700 });
    [164.8, 246.9, 329.6].forEach(freq => {
      this._tone({ type: 'sawtooth', freq, gainPeak: 0.12, duration: 0.35 });
    });
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

  /** Dramatic VS fanfare — played when the VS screen opens. */
  playVsStinger() {
    // Rising A-minor fanfare: tonic → fifth → octave
    this._tone({ type: 'square', freq: 440,  gainPeak: 0.22, duration: 0.18, start: 0 });
    this._tone({ type: 'square', freq: 659.3, gainPeak: 0.25, duration: 0.22, start: 0.16 });
    this._tone({ type: 'square', freq: 880,   gainPeak: 0.28, duration: 0.50, start: 0.35 });
    // Bass thump accent on final note
    this._tone({ type: 'sine',   freq: 110,   gainPeak: 0.22, duration: 0.30, start: 0.35 });
    // Snare noise accent
    this._noise({ gainPeak: 0.18, duration: 0.12, start: 0.35, filterFreq: 1400 });
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
    this.stopMenuMusic();           // music is mutually exclusive
    if (this._musicPlaying) return;
    const ctx = this._getCtx();

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
    const ctx  = this._getCtx();
    const LOOK = 0.2;

    while (this._leadTime < ctx.currentTime + LOOK) {
      const [freq, dur16] = LEAD[this._leadIdx];
      const dur = dur16 * S16;
      if (freq > 0) this._musicOsc(freq, this._leadTime, dur * 0.85, 'square', 0.048, this._musicMasterGain);
      this._leadTime += dur;
      this._leadIdx = (this._leadIdx + 1) % LEAD.length;
    }

    while (this._bassTime < ctx.currentTime + LOOK) {
      const [freq, dur16] = BASS[this._bassIdx];
      const dur = dur16 * S16;
      if (freq > 0) this._musicOsc(freq, this._bassTime, dur * 0.88, 'triangle', 0.10, this._musicMasterGain);
      this._bassTime += dur;
      this._bassIdx = (this._bassIdx + 1) % BASS.length;
    }

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

  // ── Menu music ────────────────────────────────────────────────────────────────

  startMenuMusic() {
    this.stopBattleMusic();         // music is mutually exclusive
    if (this._menuPlaying) return;
    const ctx = this._getCtx();

    this._menuMasterGain = ctx.createGain();
    this._menuMasterGain.gain.setValueAtTime(0, ctx.currentTime);
    this._menuMasterGain.gain.linearRampToValueAtTime(0.30, ctx.currentTime + 1.2);
    this._menuMasterGain.connect(ctx.destination);

    this._menuPlaying = true;
    const start = ctx.currentTime + 0.05;
    this._menuLeadTime = start; this._menuLeadIdx = 0;
    this._menuBassTime = start; this._menuBassIdx = 0;
    this._menuHhTime   = start; this._menuHhIdx   = 0;

    this._menuTick();
  }

  stopMenuMusic() {
    if (!this._menuPlaying) return;
    this._menuPlaying = false;
    clearTimeout(this._menuTimerId);

    if (this._menuMasterGain) {
      const ctx = this._getCtx();
      const g   = this._menuMasterGain;
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
      setTimeout(() => { try { g.disconnect(); } catch (_e) {} }, 700);
      this._menuMasterGain = null;
    }
  }

  _menuTick() {
    if (!this._menuPlaying) return;
    const ctx  = this._getCtx();
    const LOOK = 0.2;

    while (this._menuLeadTime < ctx.currentTime + LOOK) {
      const [freq, dur16] = MENU_LEAD[this._menuLeadIdx];
      const dur = dur16 * MS16;
      if (freq > 0) this._musicOsc(freq, this._menuLeadTime, dur * 0.88, 'sine', 0.055, this._menuMasterGain);
      this._menuLeadTime += dur;
      this._menuLeadIdx = (this._menuLeadIdx + 1) % MENU_LEAD.length;
    }

    while (this._menuBassTime < ctx.currentTime + LOOK) {
      const [freq, dur16] = MENU_BASS[this._menuBassIdx];
      const dur = dur16 * MS16;
      if (freq > 0) this._musicOsc(freq, this._menuBassTime, dur * 0.92, 'triangle', 0.09, this._menuMasterGain);
      this._menuBassTime += dur;
      this._menuBassIdx = (this._menuBassIdx + 1) % MENU_BASS.length;
    }

    while (this._menuHhTime < ctx.currentTime + LOOK) {
      const [type, dur16] = MENU_HIHAT[this._menuHhIdx];
      const dur = dur16 * MS16;
      if (type === HH_MARK) this._menuHihat(this._menuHhTime);
      this._menuHhTime += dur;
      this._menuHhIdx = (this._menuHhIdx + 1) % MENU_HIHAT.length;
    }

    this._menuTimerId = setTimeout(() => this._menuTick(), 20);
  }

  // ── Shared music primitives ───────────────────────────────────────────────────

  /**
   * Schedule a music oscillator note into a given master gain bus.
   * @param {number} freq
   * @param {number} startTime  — AudioContext absolute time
   * @param {number} duration   — seconds
   * @param {string} type       — OscillatorType
   * @param {number} gainPeak
   * @param {GainNode} masterGain — which bus to route into
   */
  _musicOsc(freq, startTime, duration, type, gainPeak, masterGain) {
    try {
      if (!masterGain) return;
      const ctx = this._getCtx();
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g);
      g.connect(masterGain);
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

  /** Synthesised kick drum — routes into battle music bus. */
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

  /** Synthesised snare — routes into battle music bus. */
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

  /** Soft hi-hat — routes into menu music bus. */
  _menuHihat(t) {
    try {
      if (!this._menuMasterGain) return;
      const ctx    = this._getCtx();
      const bufLen = Math.ceil(ctx.sampleRate * 0.06);
      const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data   = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hpf = ctx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.value = 7000;
      const g = ctx.createGain();
      src.connect(hpf);
      hpf.connect(g);
      g.connect(this._menuMasterGain);
      g.gain.setValueAtTime(0.025, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.start(t);
      src.stop(t + 0.07);
    } catch (_e) {}
  }
}
