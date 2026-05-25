import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useSettings } from '../lib/SettingsContext.jsx';

function fmtTime(s) {
  const v = Number.isFinite(s) && s > 0 ? s : 0;
  const m = Math.floor(v / 60);
  const sec = Math.floor(v % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function AudioCard({ note }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  // a stable, decorative waveform
  const bars = useMemo(
    () => Array.from({ length: 38 }, (_, i) =>
      4 + Math.round((Math.abs(Math.sin(i * 1.7)) * 0.7 + Math.abs(Math.sin(i * 0.5)) * 0.3) * 16)),
    [],
  );
  const progress = dur > 0 ? cur / dur : 0;

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      document.querySelectorAll('audio').forEach((el) => { if (el !== a) el.pause(); });
      a.play().catch(() => {});
    } else {
      a.pause();
    }
  }

  function seek(e) {
    const a = audioRef.current;
    if (!a || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = frac * dur;
    setCur(a.currentTime);
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
      <audio
        ref={audioRef}
        src={note.audio_url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0); }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
      />
      {note.name && <p className="mb-2 text-sm font-semibold text-neutral-800">{note.name}</p>}
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white transition active:scale-95"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex h-8 cursor-pointer items-center gap-[2px]" onClick={seek}>
            {bars.map((h, i) => (
              <span
                key={i}
                className="flex-1 rounded-full"
                style={{ height: h, background: i / bars.length <= progress ? '#f59e0b' : '#e5e5e5' }}
              />
            ))}
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-neutral-400">
            {fmtTime(playing || cur > 0 ? cur : dur)}{dur > 0 ? ` / ${fmtTime(dur)}` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AudioNotesSection() {
  const { settings } = useSettings();
  const [notes, setNotes] = useState(null);

  useEffect(() => {
    api.listAudioNotes().then(setNotes).catch(() => setNotes([]));
  }, []);

  if (settings.audio_section_enabled !== 'true') return null;
  if (!notes || notes.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-neutral-900">
          {settings.audio_title || 'Voice notes'}
        </h2>
        {settings.audio_subtitle && (
          <p className="mt-1 text-sm text-neutral-500">{settings.audio_subtitle}</p>
        )}
      </div>
      <div className="space-y-2">
        {notes.map((n) => <AudioCard key={n.id} note={n} />)}
      </div>
    </section>
  );
}
