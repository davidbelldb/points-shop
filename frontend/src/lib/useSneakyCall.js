/**
 * useSneakyCall — peer-to-peer video call hook for Sneaky Calls (/call).
 *
 * Adapted from useWebRTC (Tic-Tac-Face). Same signaling relay
 * (/api/rtc/signal) and ICE setup, but with a ring/join handshake instead
 * of an immediate offer:
 *
 *   Caller:  startCall(true)  → push fired via /api/calls/ring (by the page),
 *            then waits for the callee's 'join' signal before sending the
 *            SDP offer. This avoids the offer expiring from the 60s relay
 *            window while the callee is still tapping the notification.
 *   Callee:  startCall(false) → announces itself with a 'join' signal and
 *            answers the incoming offer.
 *
 * Returns:
 *   { localStream, remoteStream, status, remoteCamOn,
 *     startCall, endCall, setLocalCam, setLocalMic }
 *
 * status: 'idle' | 'ringing' | 'connecting' | 'connected' | 'ended'
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const POLL_MS = 500;

export function useSneakyCall() {
  const pcRef     = useRef(null);
  const pollerRef = useRef(null);
  const localRef  = useRef(null);   // raw MediaStream from getUserMedia
  const activeRef = useRef(false);  // guard against double setup
  const offeredRef = useRef(false); // caller: offer already sent

  const [localStream,  setLocalStream]  = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [status,       setStatus]       = useState('idle');
  const [remoteCamOn,  setRemoteCamOn]  = useState(true);
  const [remoteFilter, setRemoteFilter] = useState('none');

  function teardown() {
    clearInterval(pollerRef.current);
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach(t => t.stop());
    localRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }

  async function sendSignal(type, payload) {
    try { await api.rtcSignal(type, payload); } catch { /* best-effort */ }
  }

  async function sendOffer(pc) {
    if (offeredRef.current) return;
    offeredRef.current = true;
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    await sendSignal('offer', { type: offer.type, sdp: offer.sdp });
  }

  async function handleSignal(pc, isInitiator, { type, payload }) {
    try {
      if (type === 'join' && isInitiator) {
        // Callee has arrived — send (or re-send after their reload) the offer.
        await sendOffer(pc);

      } else if (type === 'offer' && !isInitiator) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal('answer', { type: answer.type, sdp: answer.sdp });

      } else if (type === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload));
        }

      } else if (type === 'ice' && payload) {
        await pc.addIceCandidate(new RTCIceCandidate(payload));
      }
    } catch (err) {
      console.warn('[SneakyCall] signal handling error', type, err?.message);
    }
  }

  // ── main entry point ──────────────────────────────────────────────────────

  const startCall = useCallback(async (isInitiator) => {
    if (activeRef.current) return;
    activeRef.current = true;
    offeredRef.current = false;

    teardown();
    setRemoteCamOn(true);
    setRemoteFilter('none');
    setStatus(isInitiator ? 'ringing' : 'connecting');

    // ── 1. Local camera + mic ─────────────────────────────────────────────
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      } catch (err) {
        console.warn('[SneakyCall] getUserMedia failed:', err?.message);
        activeRef.current = false; // allow retry
        setStatus('idle');
        throw new Error('Camera/microphone access was blocked.');
      }
    }
    localRef.current = stream;
    setLocalStream(stream);

    // ── 2. Peer connection ────────────────────────────────────────────────
    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcRef.current = pc;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    // Re-publish a fresh MediaStream on each new track (iOS Safari rebind).
    const remote = new MediaStream();
    setRemoteStream(remote);
    pc.ontrack = (e) => {
      const incoming = e.streams[0]?.getTracks() ?? (e.track ? [e.track] : []);
      let changed = false;
      incoming.forEach(t => {
        if (!remote.getTracks().includes(t)) {
          remote.addTrack(t);
          changed = true;
        }
      });
      if (changed) setRemoteStream(new MediaStream(remote.getTracks()));
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal('ice', e.candidate.toJSON());
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setStatus('connected');
      if (['disconnected', 'failed'].includes(pc.connectionState)) {
        console.warn('[SneakyCall] connection state:', pc.connectionState);
      }
    };

    // ── 3. Handshake ──────────────────────────────────────────────────────
    // Caller waits for 'join'; callee announces itself.
    if (!isInitiator) await sendSignal('join', {});

    // ── 4. Poll for signals ───────────────────────────────────────────────
    pollerRef.current = setInterval(async () => {
      try {
        const { signals } = await api.rtcPoll();
        const p = pcRef.current;
        if (!p) return;
        for (const sig of signals) {
          if (sig.type === 'hangup') {
            teardown();
            activeRef.current = false;
            setStatus('ended');
            return;
          }
          if (sig.type === 'camstate') {
            setRemoteCamOn(!!sig.payload?.camOn);
            continue;
          }
          if (sig.type === 'filter') {
            setRemoteFilter(sig.payload?.id ?? 'none');
            continue;
          }
          await handleSignal(p, isInitiator, sig);
        }
      } catch { /* ignore */ }
    }, POLL_MS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── hang up ───────────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    sendSignal('hangup', {});
    teardown();
    activeRef.current = false;
    setStatus('ended');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── camera toggle — also tells partner so they can show the photo ────────
  const setLocalCam = useCallback((enabled) => {
    localRef.current?.getVideoTracks().forEach(t => { t.enabled = enabled; });
    sendSignal('camstate', { camOn: enabled });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── mic toggle — local only; partner just hears silence ──────────────────
  const setLocalMic = useCallback((enabled) => {
    localRef.current?.getAudioTracks().forEach(t => { t.enabled = enabled; });
  }, []);

  // ── filter — tell the partner which filter to render our feed with ───────
  const sendFilter = useCallback((id) => {
    sendSignal('filter', { id });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      teardown();
      activeRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { localStream, remoteStream, status, remoteCamOn, remoteFilter, startCall, endCall, setLocalCam, setLocalMic, sendFilter };
}
