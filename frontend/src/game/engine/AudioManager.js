/**
 * AudioManager
 *
 * Synthesised SFX + background music — no audio files required.
 * AudioContext is created on first call (browser autoplay policy).
 *
 * Battle music (A minor, 162 BPM, 4-bar loop):
 *   Bar 1 — Cambridge bell-chime motif (ascending arpeggios)
 *   Bar 2 — Battle charge theme
 *   Bar 3 — Flowing 16th-note run
 *   Bar 4 — Climax and resolution
 *
 * Menu music (A minor, 150 BPM, 4-bar loop):
 *   Streets of Rage style — driving sawtooth lead, square bass,
 *   hard kick/snare on beats 1&3 and 2&4, tight 16th hi-hats.
 */

// ─── Shared frequencies (Hz) — A natural minor ────────────────────────────────

const E2=82.4, G2=98.0, A2=110, B2=123.5, C3=130.8, D3=146.8, E3=164.8;
const G3=196, A3=220;
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

// ─── Menu music note data (150 BPM — Streets of Rage style) ──────────────────

const MENU_BPM = 150;
const MS16     = 60 / MENU_BPM / 4;  // one sixteenth-note (0.1 s)

// Punchy A-minor riff — syncopated, SoR flavour
// 4 bars × 16 sixteenths = 64 note entries
const MENU_LEAD = [
  // Bar 1 — opening punch
  [A4,1],[R,1],[A4,1],[A4,1], [C5,2],[R,2], [A4,1],[G4,1],[A4,1],[R,1], [E5,4],
  // Bar 2 — response phrase
  [E5,1],[R,1],[E5,1],[D5,1], [C5,2],[R,2], [B4,1],[A4,1],[G4,1],[R,1], [A4,4],
  // Bar 3 — ascending run
  [A4,1],[B4,1],[C5,1],[D5,1], [E5,2],[D5,1],[C5,1], [B4,1],[A4,1],[B4,1],[C5,1], [E5,4],
  // Bar 4 — climax + punch out
  [G5,2],[R,1],[E5,1], [D5,1],[E5,1],[C5,2], [D5,2],[R,2], [A4,4],
];

// Heavy octave-jumping bass (8th-note pattern, each note = 2 sixteenths)
const MENU_BASS = [
  // Bar 1
  [A2,2],[A3,2],[A2,2],[G2,2],[G2,2],[G3,2],[G2,2],[A2,2],
  // Bar 2
  [A2,2],[A2,2],[E3,2],[A2,2],[E2,2],[E2,2],[E3,2],[E2,2],
  // Bar 3
  [A2,2],[C3,2],[E3,2],[A3,2],[A2,2],[G2,2],[A2,2],[A2,2],
  // Bar 4
  [D3,2],[D3,2],[E3,2],[E3,2],[A2,2],[A2,2],[A2,4],
];

// Full 4-bar percussion pattern (kick on 1&3, snare on 2&4, hi-hat on all 16ths)
const _BAR_PERC = [
  [KICK,1],[HH_MARK,1],[HH_MARK,1],[HH_MARK,1],
  [SNARE,1],[HH_MARK,1],[HH_MARK,1],[HH_MARK,1],
  [KICK,1],[HH_MARK,1],[HH_MARK,1],[HH_MARK,1],
  [SNARE,1],[HH_MARK,1],[HH_MARK,1],[HH_MARK,1],
];
const MENU_PERC = [..._BAR_PERC, ..._BAR_PERC, ..._BAR_PERC, ..._BAR_PERC];

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
    this._menuPercIdx  = 0; this._menuPercTime  = 0;
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
    this._tone({ type: 'square', freq: 440,   gainPeak: 0.22, duration: 0.18, start: 0 });
    this._tone({ type: 'square', freq: 659.3, gainPeak: 0.25, duration: 0.22, start: 0.16 });
    this._tone({ type: 'square', freq: 880,   gainPeak: 0.28, duration: 0.50, start: 0.35 });
    this._tone({ type: 'sine',   freq: 110,   gainPeak: 0.22, duration: 0.30, start: 0.35 });
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
    this.stopMenuMusic();
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
    this.stopBattleMusic();
    if (this._menuPlaying) return;
    const ctx = this._getCtx();

    this._menuMasterGain = ctx.createGain();
    this._menuMasterGain.gain.setValueAtTime(0, ctx.currentTime);
    this._menuMasterGain.gain.linearRampToValueAtTime(0.34, ctx.currentTime + 0.8);
    this._menuMasterGain.connect(ctx.destination);

    this._menuPlaying = true;
    const start = ctx.currentTime + 0.05;
    this._menuLeadTime = start; this._menuLeadIdx = 0;
    this._menuBassTime = start; this._menuBassIdx = 0;
    this._menuPercTime = start; this._menuPercIdx = 0;

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

    // Lead — sawtooth, staccato (SoR grit)
    while (this._menuLeadTime < ctx.currentTime + LOOK) {
      const [freq, dur16] = MENU_LEAD[this._menuLeadIdx];
      const dur = dur16 * MS16;
      if (freq > 0) this._musicOsc(freq, this._menuLeadTime, dur * 0.58, 'sawtooth', 0.052, this._menuMasterGain);
      this._menuLeadTime += dur;
      this._menuLeadIdx = (this._menuLeadIdx + 1) % MENU_LEAD.length;
    }

    // Bass — square, punchy
    while (this._menuBassTime < ctx.currentTime + LOOK) {
      const [freq, dur16] = MENU_BASS[this._menuBassIdx];
      const dur = dur16 * MS16;
      if (freq > 0) this._musicOsc(freq, this._menuBassTime, dur * 0.72, 'square', 0.10, this._menuMasterGain);
      this._menuBassTime += dur;
      this._menuBassIdx = (this._menuBassIdx + 1) % MENU_BASS.length;
    }

    // Percussion — kick / snare / hi-hat
    while (this._menuPercTime < ctx.currentTime + LOOK) {
      const [type, dur16] = MENU_PERC[this._menuPercIdx];
      const dur = dur16 * MS16;
      if (type === KICK)     this._menuKick(this._menuPercTime);
      if (type === SNARE)    this._menuSnare(this._menuPercTime);
      if (type === HH_MARK)  this._menuHihat(this._menuPercTime);
      this._menuPercTime += dur;
      this._menuPercIdx = (this._menuPercIdx + 1) % MENU_PERC.length;
    }

    this._menuTimerId = setTimeout(() => this._menuTick(), 20);
  }

  // ── Shared music primitives ───────────────────────────────────────────────────

  /**
   * Schedule a music oscillator note into a given master gain bus.
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

  // ─── Battle percussion ────────────────────────────────────────────────────────

  /** Kick drum — battle music bus. */
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

  /** Heavy snare — battle music bus. Gain 0.18 + pitched crack body. */
  _musicSnare(t) {
    try {
      if (!this._musicMasterGain) return;
      const ctx    = this._getCtx();
      // Noise layer
      const bufLen = Math.ceil(ctx.sampleRate * 0.16);
      const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data   = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = 2000;
      bpf.Q.value = 0.7;
      const g = ctx.createGain();
      src.connect(bpf);
      bpf.connect(g);
      g.connect(this._musicMasterGain);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      src.start(t);
      src.stop(t + 0.18);
      // Pitched crack body
      const osc = ctx.createOscillator();
      const og  = ctx.createGain();
      osc.connect(og);
      og.connect(this._musicMasterGain);
      osc.frequency.setValueAtTime(240, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.06);
      og.gain.setValueAtTime(0.10, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.start(t);
      osc.stop(t + 0.09);
    } catch (_e) {}
  }

  // ─── Menu percussion ──────────────────────────────────────────────────────────

  /** Heavy kick drum — menu music bus. */
  _menuKick(t) {
    try {
      if (!this._menuMasterGain) return;
      const ctx = this._getCtx();
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g);
      g.connect(this._menuMasterGain);
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.10);
      g.gain.setValueAtTime(0.28, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.start(t);
      osc.stop(t + 0.14);
    } catch (_e) {}
  }

  /** Heavy snare — menu music bus. Noise burst + pitched crack. */
  _menuSnare(t) {
    try {
      if (!this._menuMasterGain) return;
      const ctx    = this._getCtx();
      // Noise burst
      const bufLen = Math.ceil(ctx.sampleRate * 0.14);
      const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data   = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = 2400;
      bpf.Q.value = 0.6;
      const g = ctx.createGain();
      src.connect(bpf);
      bpf.connect(g);
      g.connect(this._menuMasterGain);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.start(t);
      src.stop(t + 0.15);
      // Crack tone
      const osc = ctx.createOscillator();
      const og  = ctx.createGain();
      osc.connect(og);
      og.connect(this._menuMasterGain);
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(75, t + 0.05);
      og.gain.setValueAtTime(0.12, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.start(t);
      osc.stop(t + 0.08);
    } catch (_e) {}
  }

  /** Tight hi-hat — menu music bus. */
  _menuHihat(t) {
    try {
      if (!this._menuMasterGain) return;
      const ctx    = this._getCtx();
      const bufLen = Math.ceil(ctx.sampleRate * 0.04);
      const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data   = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hpf = ctx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.value = 8000;
      const g = ctx.createGain();
      src.connect(hpf);
      hpf.connect(g);
      g.connect(this._menuMasterGain);
      g.gain.setValueAtTime(0.032, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      src.start(t);
      src.stop(t + 0.05);
    } catch (_e) {}
  }
}
