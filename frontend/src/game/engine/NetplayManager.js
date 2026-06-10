/**
 * NetplayManager — host-authoritative online play for Streets of Cambs-Rage.
 *
 * Reuses the SneakyTime WebRTC stack: the /api/rtc/signal REST relay carries
 * the SDP/ICE handshake (signal types prefixed 'cr-' so they can't be confused
 * with call signals), then ALL game traffic flows over a peer-to-peer
 * DataChannel — the server is out of the loop once connected.
 *
 *   Host:  runs the full simulation. Receives guest inputs, sends state
 *          snapshots (~30/s) + control messages.
 *   Guest: sends its input state every frame, renders received snapshots.
 *
 * Handshake mirrors the call flow: the guest announces itself with 'cr-join',
 * the host replies with the offer — so the offer can't expire while the
 * guest is still tapping the push notification.
 *
 * NOTE: the relay inbox is drained by whoever polls it, so don't run a
 * SneakyTime call handshake and a netplay handshake at the same time.
 * Once the DataChannel is open this manager stops polling entirely.
 */

import { api } from '../../lib/api.js';

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const POLL_MS = 400;

export class NetplayManager {
  /** @param {'host'|'guest'} role */
  constructor(role) {
    this.role = role;
    this.pc = null;
    this.channel = null;
    this._poller = null;
    this._offered = false;
    this._closed = false;

    // Callbacks — assign before connect()
    this.onOpen = null;     // channel ready
    this.onMessage = null;  // (obj) parsed JSON from peer
    this.onClose = null;    // channel/connection lost or peer hung up
  }

  get isOpen() {
    return this.channel?.readyState === 'open';
  }

  async _signal(type, payload) {
    try { await api.rtcSignal(`cr-${type}`, payload ?? {}); } catch { /* best-effort */ }
  }

  async connect() {
    if (this.pc) return;
    this._closed = false;

    const pc = new RTCPeerConnection(ICE_CONFIG);
    this.pc = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) this._signal('ice', e.candidate.toJSON());
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        this._teardown(true);
      }
    };

    const wireChannel = (ch) => {
      this.channel = ch;
      ch.onopen = () => {
        // Connected — signaling no longer needed.
        clearInterval(this._poller);
        this._poller = null;
        this.onOpen?.();
      };
      ch.onmessage = (e) => {
        try { this.onMessage?.(JSON.parse(e.data)); } catch { /* ignore */ }
      };
      ch.onclose = () => this._teardown(true);
    };

    if (this.role === 'host') {
      // Reliable ordered channel — snapshots are small (≈200B at 30Hz) and
      // inputs are full held-sets, so ordering loss matters more than latency.
      wireChannel(pc.createDataChannel('cambs-rage', { ordered: true }));
    } else {
      pc.ondatachannel = (e) => wireChannel(e.channel);
      await this._signal('join', {});
    }

    // Poll the relay for handshake signals until the channel opens.
    this._poller = setInterval(async () => {
      try {
        const { signals } = await api.rtcPoll();
        for (const sig of signals) {
          await this._handleSignal(sig);
        }
      } catch { /* ignore */ }
    }, POLL_MS);
  }

  async _handleSignal({ type, payload }) {
    const pc = this.pc;
    if (!pc) return;
    try {
      if (type === 'cr-join' && this.role === 'host') {
        if (this._offered) return;
        this._offered = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await this._signal('offer', { type: offer.type, sdp: offer.sdp });

      } else if (type === 'cr-offer' && this.role === 'guest') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await this._signal('answer', { type: answer.type, sdp: answer.sdp });

      } else if (type === 'cr-answer' && this.role === 'host') {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload));
        }

      } else if (type === 'cr-ice' && payload) {
        await pc.addIceCandidate(new RTCIceCandidate(payload));

      } else if (type === 'cr-hangup') {
        this._teardown(true);
      }
    } catch (err) {
      console.warn('[Netplay] signal error', type, err?.message);
    }
  }

  send(obj) {
    if (this.channel?.readyState === 'open') {
      try { this.channel.send(JSON.stringify(obj)); } catch { /* ignore */ }
    }
  }

  _teardown(notify) {
    if (this._closed) return;
    this._closed = true;
    clearInterval(this._poller);
    this._poller = null;
    try { this.channel?.close(); } catch { /* ignore */ }
    try { this.pc?.close(); } catch { /* ignore */ }
    this.channel = null;
    this.pc = null;
    if (notify) this.onClose?.();
  }

  /** Graceful local close — tells the peer if still in handshake. */
  close() {
    if (!this.isOpen) this._signal('hangup', {});
    this._teardown(false);
  }
}
