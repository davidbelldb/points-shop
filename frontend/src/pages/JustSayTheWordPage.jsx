/**
 * Just Say The Word
 *
 * Daily pronunciation game — 5 words/day, same for both players. Say each word
 * aloud; Azure Pronunciation Assessment scores it 0–100 and per-syllable. Points
 * per word: 100→16, 80–99→12, 60–79→8, 40–59→4, <40→0.
 *
 * Styled to match Dirty Wordle (Dirdle).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useTheme } from '../lib/ThemeContext.jsx';
import { hapticTap, hapticSharpTriple, hapticParty, hapticShudder } from '../lib/haptics.js';

// ── Shared tokens (mirror Dirdle) ───────────────────────────────────────────
const GOOD = '#61dbbb';   // green
const OK   = '#f0b232';   // amber
const BAD  = '#ef4444';   // red
const PINK = '#ed70bd';
const TEAL_BTN  = 'inline-flex items-center justify-center rounded-xl bg-[#61dbbb] px-4 py-3 text-sm font-semibold text-[#0d3d2e] transition hover:opacity-90 active:scale-95';
const GHOST_BTN = 'inline-flex items-center justify-center rounded-xl border border-neutral-400 bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-200 active:scale-95 dark:border-neutral-500 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600';

const PTS = [[100, 16], [80, 12], [60, 8], [40, 4], [0, 0]];
function pointsForScore(s) { for (const [t, p] of PTS) if (s >= t) return p; return 0; }
function colourForScore(s) { return s >= 80 ? GOOD : s >= 60 ? OK : BAD; }

function getTodayDate() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
function formatUKDate() {
  const [y, m, d] = getTodayDate().split('-');
  return `${d}/${m}/${y}`;
}

// ── Azure Pronunciation Assessment ───────────────────────────────────────────
// Returns { score, syllables:[{ text, score }] } aligned to `displaySyllables`.
let _sdkPromise = null;
function loadSdk() {
  if (!_sdkPromise) _sdkPromise = import('microsoft-cognitiveservices-speech-sdk');
  return _sdkPromise;
}

async function assessPronunciation(word, displaySyllables) {
  const mod = await loadSdk();
  const SDK = mod.SpeechConfig ? mod : (mod.default ?? mod); // CJS/ESM interop
  const { token, region } = await api.jstwSpeechToken();

  const speechConfig = SDK.SpeechConfig.fromAuthorizationToken(token, region);
  speechConfig.speechRecognitionLanguage = 'en-GB';
  const audioConfig = SDK.AudioConfig.fromDefaultMicrophoneInput();
  const paConfig = new SDK.PronunciationAssessmentConfig(
    word,
    SDK.PronunciationAssessmentGradingSystem.HundredMark,
    SDK.PronunciationAssessmentGranularity.Phoneme,
    false,
  );
  const recognizer = new SDK.SpeechRecognizer(speechConfig, audioConfig);
  paConfig.applyTo(recognizer);

  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 12000);
    recognizer.recognizeOnceAsync(
      (r) => { clearTimeout(timer); resolve(r); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  }).finally(() => { try { recognizer.close(); } catch { /* ignore */ } });

  const pa = SDK.PronunciationAssessmentResult.fromResult(result);
  const overall = Math.round(pa?.accuracyScore ?? pa?.pronunciationScore ?? 0);

  // Pull Azure's per-syllable accuracy from the raw JSON and align to ours.
  let azure = [];
  try {
    const json = JSON.parse(result.properties.getProperty(SDK.PropertyId.SpeechServiceResponse_JsonResult));
    for (const w of (json?.NBest?.[0]?.Words ?? [])) {
      for (const sy of (w.Syllables ?? [])) {
        azure.push(Math.round(sy.PronunciationAssessment?.AccuracyScore ?? overall));
      }
    }
  } catch { /* fall back to overall */ }

  const syllables = displaySyllables.map((text, i) => ({
    text,
    score: azure.length === displaySyllables.length ? azure[i] : overall,
  }));
  // Word score = the average of the syllables actually shown, so the number and
  // the green/amber/red colouring always agree (Azure's word-level score can
  // otherwise sit lower than every individual syllable).
  const score = Math.round(syllables.reduce((a, s) => a + s.score, 0) / syllables.length);
  return { score, syllables };
}

// ── Syllable word display ────────────────────────────────────────────────────
// Each syllable is a group of grey letter-boxes; once scored, the group fills
// with its colour. `revealed` = how many syllables have been coloured so far.
function SyllableWord({ syllables, scored, revealed, isDark, big = false }) {
  const grey = isDark ? '#2a2a28' : '#e8e8e6';
  const greyBord = isDark ? '#3a3a38' : '#d4d4d0';
  const cell = big ? 40 : 24;
  const font = big ? 20 : 13;
  const letterGap = big ? 3 : 2;
  // Letters sit flush as one word until it's scored; then each syllable slides
  // apart via an animated left-margin (gap itself isn't animatable in WebKit).
  const splitGap = big ? 10 : 6;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: letterGap, justifyContent: 'center' }}>
      {syllables.map((syl, si) => {
        const text = typeof syl === 'string' ? syl : syl.text;
        const score = typeof syl === 'string' ? null : syl.score;
        const isOn = scored && si < revealed;
        const bg = isOn ? colourForScore(score) : grey;
        const fg = isOn ? '#0d3d2e' : (isDark ? '#fff' : '#171717');
        return (
          <div key={si} style={{ display: 'flex', gap: letterGap, marginLeft: scored && si > 0 ? splitGap : 0, transition: 'margin-left 0.35s cubic-bezier(0.34,1.3,0.64,1)' }}>
            {text.toUpperCase().split('').map((ch, ci) => (
              <div
                key={ci}
                style={{
                  width: cell, height: cell, borderRadius: big ? 6 : 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: font, fontWeight: 700,
                  background: bg, color: fg,
                  border: `2px solid ${isOn ? bg : greyBord}`,
                  transition: 'background 0.25s, color 0.25s, border-color 0.25s',
                }}
              >
                {ch}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Leaderboard ──────────────────────────────────────────────────────────────
function LeaderboardModal({ onClose, today }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(today);
  const { theme } = useTheme();
  const { user } = useAuth();
  const dark = theme === 'dark';

  const minDate = (() => { const d = new Date(today); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); })();
  const isToday = viewDate === today;
  const formatViewDate = (s) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
  const formatDayMonth = (s) => { const [, m, d] = s.split('-'); return `${d}/${m}`; };
  function getDayLabel(s) {
    if (s === today) return 'TODAY';
    const y = new Date(today); y.setDate(y.getDate() - 1);
    if (s === y.toISOString().slice(0, 10)) return 'YESTERDAY';
    return ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][new Date(`${s}T12:00:00`).getDay()];
  }
  function navigateDate(delta) {
    const d = new Date(viewDate); d.setDate(d.getDate() + delta);
    const n = d.toISOString().slice(0, 10);
    if (n >= minDate && n <= today) setViewDate(n);
  }

  useEffect(() => {
    setLoading(true); setData(null);
    api.jstwLeaderboard(viewDate).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [viewDate]);

  const modalBg = dark ? '#1e1e1c' : '#ffffff';
  const cardBg = dark ? '#30302e' : '#f5f5f4';
  const cardBorder = dark ? '#3a3a38' : '#e5e5e5';
  const tableHead = dark ? '#252523' : '#e5e5e5';
  const rowBg = dark ? '#2a2a28' : '#ffffff';
  const textPri = dark ? '#ffffff' : '#171717';
  const textSec = dark ? '#a3a3a3' : '#737373';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl shadow-xl overflow-hidden" style={{ background: modalBg }}>
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <h2 className="font-bold text-lg tracking-tight" style={{ color: PINK }}>Dirty Talk Leaderboard</h2>
          <button onClick={onClose} aria-label="Close" style={{ color: textSec, background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, padding: '0 0 0 8px' }}>✕</button>
        </div>
        <div className="px-5 pb-5 space-y-6 max-h-[80vh] overflow-y-auto">
          {loading && <p className="text-sm text-center" style={{ color: textSec }}>Loading…</p>}
          {!loading && !data && <p className="text-sm text-center" style={{ color: textSec }}>Couldn't load scores.</p>}
          {data && (
            <>
              {/* Today + date navigation */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: textSec }}>{getDayLabel(viewDate)}</p>
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: textSec }}>{formatViewDate(viewDate)}</p>
                    <button onClick={() => navigateDate(-1)} disabled={viewDate <= minDate}
                      style={{ background: 'none', border: 'none', cursor: viewDate <= minDate ? 'default' : 'pointer', color: textPri, fontSize: 20, lineHeight: 1, padding: '0 4px', opacity: viewDate <= minDate ? 0.25 : 1, position: 'relative', top: '-1px' }}>‹</button>
                    <button onClick={() => navigateDate(1)} disabled={viewDate >= today}
                      style={{ background: 'none', border: 'none', cursor: viewDate >= today ? 'default' : 'pointer', color: textPri, fontSize: 20, lineHeight: 1, padding: '0 4px', opacity: viewDate >= today ? 0.25 : 1, position: 'relative', top: '-1px' }}>›</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {data.today.map((p) => {
                    const mine = p.name === user?.name;
                    const colour = mine ? GOOD : PINK;
                    const cardHeight = 280;
                    return p.words.length > 0 ? (
                      <div key={p.name} className="rounded-xl p-3 flex flex-col" style={{ background: cardBg, border: `1px solid ${cardBorder}`, height: cardHeight }}>
                        <p className="text-sm font-bold uppercase tracking-wide text-center mb-2" style={{ color: colour }}>{p.name}</p>
                        <div className="flex-1 overflow-y-auto space-y-1">
                          {p.words.map((w) => (
                            <div key={w.word_index} className="flex items-center justify-between text-xs" style={{ color: textPri }}>
                              <span className="truncate font-medium pr-2">{w.word}</span>
                              <span style={{ color: colourForScore(w.score), fontWeight: 700 }}>{w.score}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-xs pt-1 mt-1" style={{ borderTop: `1px solid ${cardBorder}`, color: textSec }}>
                          <span>{p.attempted}/{data.words_per_day ?? 5}</span>
                          <span className="rounded px-1.5 py-0.5 font-semibold" style={{ background: GOOD, color: '#0d3d2e' }}>+{p.total} pts</span>
                        </div>
                      </div>
                    ) : (
                      <div key={p.name} className="rounded-xl p-3 flex flex-col items-center justify-center gap-2"
                        style={{ background: cardBg, border: `1px dashed ${cardBorder}`, height: cardHeight }}>
                        <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-full" style={{ border: `3px solid ${colour}` }}>
                          {p.photo_url
                            ? <img src={p.photo_url} alt="" className="h-full w-full object-cover" />
                            : <span className="flex h-full w-full items-center justify-center text-sm font-bold" style={{ background: cardBorder, color: textPri }}>{p.name?.[0]}</span>}
                        </span>
                        <p className="text-sm font-bold uppercase tracking-wide" style={{ color: colour }}>{p.name}</p>
                        <p className="text-xs text-center font-semibold uppercase tracking-wide leading-relaxed" style={{ color: textSec }}>
                          {isToday ? <>yet to play<br />today</> : <>didn't play<br />on {formatDayMonth(viewDate)}</>}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* All time */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: textSec }}>All time</p>
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${cardBorder}` }}>
                  <div className="grid px-3 py-2 text-xs font-semibold uppercase tracking-wide" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', background: tableHead, color: textSec }}>
                    <span>Player</span><span className="text-center">Said</span><span className="text-center">Avg</span><span className="text-center">Pts</span><span className="text-center">Series</span>
                  </div>
                  {data.allTime.map((p) => {
                    const noSeries = data.completed_series_count === 0;
                    return (
                      <div key={p.name} className="grid px-3 py-2.5 text-sm items-center" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', background: rowBg, borderTop: `1px solid ${cardBorder}` }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="block h-7 w-7 shrink-0 overflow-hidden rounded-full" style={{ border: `2px solid ${cardBorder}` }}>
                            {p.photo_url ? <img src={p.photo_url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[10px] font-bold" style={{ background: cardBorder, color: textPri }}>{p.name?.[0]}</span>}
                          </span>
                          <span className="truncate font-semibold" style={{ color: textPri }}>{p.name}</span>
                        </div>
                        <span className="text-center" style={{ color: textSec }}>{p.words_attempted}</span>
                        <span className="text-center" style={{ color: textSec }}>{p.avg_score}</span>
                        <span className="text-center font-bold" style={{ color: GOOD }}>{p.total_pts}</span>
                        <span className="text-center font-bold" style={{ color: noSeries ? textSec : PINK }}>{noSeries ? '-' : p.series_wins}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function JustSayTheWordPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const today = getTodayDate();

  const [words, setWords] = useState(null);     // [{ word_index, word, syllables }]
  const [done, setDone] = useState([]);         // [{ word_index, word, score, points, syllables }]
  const [loadErr, setLoadErr] = useState(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(null);   // { syllables:[{text,score}], score } while revealing
  const [revealed, setRevealed] = useState(0);
  const [showBoard, setShowBoard] = useState(false);
  const jingleRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [{ words: w }, { results }] = await Promise.all([api.jstwWords(today), api.jstwProgress(today)]);
        setWords(w);
        setDone(results ?? []);
      } catch (e) {
        setLoadErr(e.message || 'Could not load today’s words.');
      }
    })();
  }, [today]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    try { jingleRef.current = new Audio('/word-jingle.mp3'); } catch { /* optional */ }
  }, []);

  const doneIdx = new Set(done.map((d) => d.word_index));
  const current = words?.find((w) => !doneIdx.has(w.word_index)) ?? null;
  const allDone = words && !current;

  const playJingle = () => { try { const a = jingleRef.current; if (a) { a.currentTime = 0; a.play().catch(() => {}); } } catch { /* ignore */ } };

  // Staggered reveal: colour each syllable in turn with a haptic, like the word
  // is being "filled in" as it's spoken.
  const revealSyllables = useCallback((res) => new Promise((resolve) => {
    setActive(res);
    setRevealed(0);
    let i = 0;
    const step = () => {
      i += 1;
      setRevealed(i);
      hapticSharpTriple();
      if (i < res.syllables.length) setTimeout(step, 320);
      else {
        setTimeout(() => {
          if (res.score >= 100) { playJingle(); hapticParty(); }   // perfect — full marks fanfare
          else (res.score >= 60 ? hapticParty : hapticShudder)();
          resolve();
        }, 360);
      }
    };
    setTimeout(step, 250);
  }), []);

  const listen = useCallback(async () => {
    if (!current || listening) return;
    setError(null);
    setListening(true);
    hapticTap();
    try {
      const displaySyll = current.syllables;
      const res = await assessPronunciation(current.word, displaySyll);
      setListening(false);
      await revealSyllables(res);
      // Persist
      let points = pointsForScore(res.score);
      try {
        const r = await api.jstwResult({ date: today, word_index: current.word_index, word: current.word, score: res.score, syllables: res.syllables });
        points = r.points ?? points;
      } catch { /* keep local */ }
      // Move the spoken word into the list above and advance.
      setDone((d) => [...d, { word_index: current.word_index, word: current.word, score: res.score, points, syllables: res.syllables }]);
      setActive(null);
      setRevealed(0);
    } catch (e) {
      setListening(false);
      setActive(null);
      const msg = /not configured/i.test(e?.message) ? 'Speech scoring isn’t switched on yet.' : 'Speak up, buddy - didn’t catch that.';
      setError(msg);
      hapticShudder();
    }
  }, [current, listening, revealSyllables, today]);

  const totalToday = done.reduce((a, d) => a + Number(d.points), 0);

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      {/* Header */}
      <div className="w-full max-w-sm flex items-center justify-between px-2">
        <Link to="/games" className="w-20 text-sm text-neutral-500">← Games</Link>
        <h1 className="font-bold text-lg tracking-wide text-center">Dirty Talk</h1>
        <button onClick={() => setShowBoard(true)} className="w-20 text-right text-sm font-medium text-neutral-500">Scores</button>
      </div>
      <p className="text-xs text-neutral-400">{formatUKDate()}. Say it like you mean it, yeah?</p>

      {loadErr && <p className="text-sm text-red-500">{loadErr}</p>}

      {/* Spoken-word list (above active area) */}
      {done.length > 0 && (
        <div className="w-full max-w-sm flex flex-col gap-2">
          {done.map((d) => (
            <div key={d.word_index} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
              style={{ background: isDark ? '#252523' : '#f5f5f4', animation: 'jstw-rise 320ms cubic-bezier(0.34,1.56,0.64,1) backwards' }}>
              <SyllableWord syllables={d.syllables?.length ? d.syllables : (words?.find((w) => w.word_index === d.word_index)?.syllables ?? [])} scored revealed={99} isDark={isDark} />
              <div className="text-right shrink-0">
                <p className="text-sm font-bold" style={{ color: colourForScore(d.score) }}>{d.score}</p>
                {d.points > 0 && <p className="text-[10px] font-semibold" style={{ color: GOOD }}>+{d.points}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active word */}
      {words && !allDone && (
        <div className="w-full max-w-sm flex flex-col items-center gap-5 mt-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            Word {done.length + 1} of {words.length}
          </p>
          <div className="min-h-[60px] flex items-center justify-center">
            <SyllableWord
              syllables={active ? active.syllables : current.syllables}
              scored={!!active}
              revealed={active ? revealed : 0}
              isDark={isDark}
              big
            />
          </div>
          {error && <p className="text-sm font-semibold" style={{ color: PINK }}>{error}</p>}
          <button onClick={listen} disabled={listening} className={`${TEAL_BTN} w-44 disabled:opacity-60`}>
            {listening ? 'Listening…' : "Let's hear it, then"}
          </button>
          <p className="text-[11px] text-neutral-400">Today: {totalToday} pts</p>
        </div>
      )}

      {/* Summary when all 5 done */}
      {allDone && (
        <div className="w-full max-w-sm rounded-2xl p-6 text-center space-y-3 mt-2" style={{ background: isDark ? '#252523' : '#f5f5f4' }}>
          <h2 className="text-xl font-bold" style={{ color: GOOD }}>All said and done, {user?.name ?? 'you'}!</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-300">You scored <span className="font-bold" style={{ color: PINK }}>{totalToday}</span> points today.</p>
          <button onClick={() => setShowBoard(true)} className={`${TEAL_BTN} w-full`}>See the leaderboard</button>
        </div>
      )}

      {showBoard && <LeaderboardModal onClose={() => setShowBoard(false)} today={today} />}

      <style>{`
        @keyframes jstw-rise { 0% { opacity: 0; transform: translateY(14px) scale(0.96); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  );
}
