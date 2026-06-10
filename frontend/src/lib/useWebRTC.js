/**
 * useWebRTC — peer-to-peer video call hook for Tic-Tac-Face.
 *
 * Signaling: REST polling against /api/rtc/signal (no WebSocket needed).
 * Media:     peer-to-peer via WebRTC after ICE negotiation.
 *
 * Usage:
 *   const { localStream, remoteStream, initCall } = useWebRTC(gameId);
 *   // Call initCall(true) on p1, initCall(false) on p2, once per game.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const POLL_MS = 500; // signal poll interval during setup

export function useWebRTC(gameId) {
  const pcRef        = useRef(null);
  const pollerRef    = useRef(null);
  const localRef     = useRef(null);   // raw MediaStream from getUserMedia
  const calledRef    = useRef(null);   // gameId for which we've already set up

  const [localStream,  setLocalStream]  = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // ── internal helpers ──────────────────────────────────────────────────────

  async function sendSignal(type, payload) {
    try { await api.rtcSignal(type, payload); } catch { /* best-effort */ }
  }

  async function handleSignal(pc, { type, payload }) {
    try {
      if (type === 'offer') {
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
      console.warn('[WebRTC] signal handling error', type, err?.message);
    }
  }

  // ── main entry point ──────────────────────────────────────────────────────

  const initCall = useCallback(async (isInitiator) => {
    // Guard: only ever set up once per game
    if (calledRef.current === gameId) return;
    calledRef.current = gameId;

    // Tear down any previous connection (e.g. prior game)
    clearInterval(pollerRef.current);
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach(t => t.stop());
    localRef.current = null;

    // ── 1. Get local camera stream ────────────────────────────────────────
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
        console.warn('[WebRTC] getUserMedia failed:', err?.message);
        calledRef.current = null; // allow retry
        return;
      }
    }
    localRef.current = stream;
    setLocalStream(stream);

    // ── 2. Create peer connection ─────────────────────────────────────────
    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcRef.current = pc;

    // Add local tracks to connection
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    // Collect remote tracks into a single MediaStream
    const remote = new MediaStream();
    setRemoteStream(remote);
    pc.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach(t => {
        if (!remote.getTracks().includes(t)) remote.addTrack(t);
      });
    };

    // Trickle ICE candidates to partner
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal('ice', e.candidate.toJSON());
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed'].includes(pc.connectionState)) {
        console.warn('[WebRTC] connection state:', pc.connectionState);
      }
    };

    // ── 3. Initiate or await offer ────────────────────────────────────────
    if (isInitiator) {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      await sendSignal('offer', { type: offer.type, sdp: offer.sdp });
    }

    // ── 4. Poll for incoming signals ──────────────────────────────────────
    pollerRef.current = setInterval(async () => {
      try {
        const { signals } = await api.rtcPoll();
        const p = pcRef.current;
        if (!p) return;
        for (const sig of signals) await handleSignal(p, sig);
      } catch { /* ignore */ }
    }, POLL_MS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // ── cleanup when gameId changes or component unmounts ─────────────────────
  useEffect(() => {
    return () => {
      clearInterval(pollerRef.current);
      pcRef.current?.close();
      pcRef.current = null;
      localRef.current?.getTracks().forEach(t => t.stop());
      localRef.current = null;
      calledRef.current = null;
      setLocalStream(null);
      setRemoteStream(null);
    };
  }, [gameId]);

  return { localStream, remoteStream, initCall };
}
