/**
 * Shared ICE server configuration for WebRTC calls (Tic-Tac-Face's
 * useWebRTC and Sneaky Calls' useSneakyCall).
 *
 * Combines public STUN servers (enough when both peers are behind simple
 * NATs) with short-lived TURN credentials minted by the backend
 * (/api/rtc/turn-credentials, backed by coturn on the VPS). TURN provides
 * a relay fallback for symmetric NAT / CGNAT / restrictive mobile
 * networks, where STUN-only ICE negotiation can silently fail.
 */

import { api } from './api.js';

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export async function getIceConfig() {
  try {
    const { iceServers: turnServers } = await api.rtcTurnCredentials();
    if (turnServers?.length) {
      return { iceServers: [...STUN_SERVERS, ...turnServers] };
    }
  } catch {
    // TURN not configured / request failed — fall back to STUN-only.
  }
  return { iceServers: STUN_SERVERS };
}
