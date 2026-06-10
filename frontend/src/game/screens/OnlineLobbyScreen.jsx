/**
 * OnlineLobbyScreen — challenge / accept flow for online Cambs-Rage.
 *
 * Host:  taps CHALLENGE → push + ring fired, NetplayManager('host') waits
 *        for the guest's cr-join over the signal relay.
 * Guest: arrives via the "Tap to Fight!" push (?join=1) or sees the incoming
 *        challenge while sitting in this lobby, taps ACCEPT → connects.
 *
 * When the DataChannel opens, onConnected(net, role) fires and the
 * container takes over (VS screen → game).
 */

import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { NetplayManager } from '../engine/NetplayManager.js';

const PIXEL = { fontFamily: 'var(--font-pixel)' };

function LobbyButton({ children, onClick, color = '#fbbf24', disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...PIXEL,
        fontSize: '0.6rem',
        letterSpacing: '0.2em',
        color,
        background: 'rgba(0,0,0,0.55)',
        border: `2px solid ${color}88`,
        borderRadius: 6,
        padding: '12px 26px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        textShadow: `0 0 12px ${color}`,
        boxShadow: `0 0 12px ${color}40`,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {children}
    </button>
  );
}

export default function OnlineLobbyScreen({ autoJoin = false, onConnected, onBack, audio }) {
  const [status, setStatus]   = useState('idle'); // idle | waiting | connecting
  const [incoming, setIncoming] = useState(null); // challenger name or null
  const [other, setOther]     = useState(null);
  const [error, setError]     = useState(null);
  const netRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    api.callsPlayers().then(({ other: o }) => setOther(o)).catch(() => {});
  }, []);

  function wire(net, role) {
    netRef.current = net;
    net.onOpen = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      netRef.current = null; // ownership transfers to the container
      onConnected(net, role);
    };
    net.onClose = () => {
      if (doneRef.current) return;
      setStatus('idle');
      setError('Connection lost — try again');
    };
  }

  async function host() {
    if (status !== 'idle') return;
    setError(null);
    setStatus('waiting');
    audio?.playMenuConfirm();
    try {
      await api.crChallenge(); // fire "Tap to Fight!" push + ring
      const net = new NetplayManager('host');
      wire(net, 'host');
      await net.connect();
    } catch (e) {
      setStatus('idle');
      setError(e.message);
    }
  }

  async function joinAsGuest() {
    if (status === 'connecting') return;
    setError(null);
    setStatus('connecting');
    audio?.playMenuConfirm();
    api.crChallengeAnswer().catch(() => {});
    try {
      const net = new NetplayManager('guest');
      wire(net, 'guest');
      await net.connect();
    } catch (e) {
      setStatus('idle');
      setError(e.message);
    }
  }

  // Tapped the push notification — join straight away.
  const autoRef = useRef(false);
  useEffect(() => {
    if (autoJoin && !autoRef.current) {
      autoRef.current = true;
      joinAsGuest();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoin]);

  // Poll for an incoming challenge while idle in the lobby.
  useEffect(() => {
    if (status !== 'idle') return;
    let stopped = false;
    const check = async () => {
      try {
        const { incoming: ringing, from } = await api.crChallengeStatus();
        if (!stopped) setIncoming(ringing ? (from ?? 'someone') : null);
      } catch { /* ignore */ }
    };
    check();
    const t = setInterval(check, 3000);
    return () => { stopped = true; clearInterval(t); };
  }, [status]);

  // Cleanup on unmount / back — cancel ring if we were hosting.
  useEffect(() => {
    return () => {
      if (!doneRef.current && netRef.current) {
        netRef.current.close();
        netRef.current = null;
        api.crChallengeCancel().catch(() => {});
      }
    };
  }, []);

  function back() {
    if (status === 'waiting') api.crChallengeCancel().catch(() => {});
    netRef.current?.close();
    netRef.current = null;
    onBack();
  }

  const otherName = (other?.name ?? 'YOUR RIVAL').toUpperCase();

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-7 bg-black select-none">
      <p style={{ ...PIXEL, fontSize: '1.1rem', letterSpacing: '0.15em', color: '#fbbf24', textShadow: '0 0 24px #fbbf24' }}>
        ONLINE VS
      </p>

      {error && (
        <p style={{ ...PIXEL, fontSize: '0.45rem', letterSpacing: '0.1em', color: '#f87171' }}>{error.toUpperCase()}</p>
      )}

      {status === 'idle' && (
        <>
          {incoming ? (
            <>
              <p className="animate-pulse" style={{ ...PIXEL, fontSize: '0.55rem', letterSpacing: '0.15em', color: '#fff' }}>
                {incoming.toUpperCase()} WANTS TO FIGHT!
              </p>
              <LobbyButton onClick={joinAsGuest} color="#4ade80">ACCEPT CHALLENGE</LobbyButton>
            </>
          ) : (
            <LobbyButton onClick={host}>CHALLENGE {otherName}</LobbyButton>
          )}
        </>
      )}

      {status === 'waiting' && (
        <p className="animate-pulse" style={{ ...PIXEL, fontSize: '0.55rem', letterSpacing: '0.15em', color: '#fff' }}>
          WAITING FOR {otherName}…
        </p>
      )}

      {status === 'connecting' && (
        <p className="animate-pulse" style={{ ...PIXEL, fontSize: '0.55rem', letterSpacing: '0.15em', color: '#fff' }}>
          CONNECTING…
        </p>
      )}

      <button
        onClick={back}
        style={{ ...PIXEL, fontSize: '0.45rem', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.45)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 8 }}
      >
        ← BACK
      </button>

      <p style={{ ...PIXEL, fontSize: '0.38rem', letterSpacing: '0.1em', color: '#ffffff33', position: 'absolute', bottom: 10 }}>
        PICK ANY FIGHTER · WINNER TAKES 10 PTS
      </p>
    </div>
  );
}
