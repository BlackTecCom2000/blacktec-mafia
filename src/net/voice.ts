/**
 * Voice chat over the existing PeerJS data channel.
 *
 * The host is the signalling hub and the audio relay: every guest publishes
 * one audio track to the host, the host forwards it to the other guests.
 * No recording, no storage, no transcription — the stream only lives while
 * the participants are connected.
 */

import { iceServers } from './peer';

export type VoiceSignalKind = 'offer' | 'answer' | 'ice' | 'bye' | 'state';
export interface VoiceSignal {
  kind: VoiceSignalKind;
  /** Peer the signal belongs to (the host uses it to route). */
  from?: string;
  to?: string;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  /** Publishing state of the sender. */
  publishing?: boolean;
  /** Which side of the table may hear the stream. */
  audience?: 'alive' | 'dead';
}

export interface VoiceHandlers {
  /** Called when a remote participant publishes or stops publishing. */
  onState: (peerId: string, publishing: boolean, audience: 'alive' | 'dead') => void;
  onError: (message: string) => void;
  /** Called when a remote track arrives. */
  onRemoteStream?: (peerId: string, stream: MediaStream) => void;
}

const ICE_SERVERS: RTCIceServer[] = [];

/** Requests the microphone. Must be called from a user gesture. */
export async function requestMicrophone(): Promise<MediaStream | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  } catch {
    return null;
  }
}

/** Decides whether the microphone may be used right now. */
export { voicePermission, voiceAudience } from './voice-rules';
export type { VoicePermission } from './voice-rules';

/**
 * One side of the audio relay.
 * `send` delivers a signalling message through the peer data channel.
 */
export class VoicePeer {
  private readonly send: (message: VoiceSignal) => void;
  private readonly handlers: VoiceHandlers;
  private readonly selfId: string;
  private readonly remoteId: string;
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(options: {
    selfId: string;
    remoteId: string;
    send: (message: VoiceSignal) => void;
    handlers: VoiceHandlers;
  }) {
    this.selfId = options.selfId;
    this.remoteId = options.remoteId;
    this.send = options.send;
    this.handlers = options.handlers;
  }

  get publishing(): boolean {
    return this.stream !== null;
  }

  get peerId(): string {
    return this.remoteId;
  }

  /** Publishes the local microphone to the remote side. */
  async publish(stream: MediaStream, audience: 'alive' | 'dead'): Promise<void> {
    this.stream = stream;
    const pc = this.ensureConnection();
    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
    }
    await this.negotiate();
    this.send({ kind: 'state', from: this.selfId, publishing: true, audience });
  }

  stopPublishing(): void {
    this.stream = null;
    this.send({ kind: 'state', from: this.selfId, publishing: false });
    const pc = this.pc;
    if (pc) {
      for (const sender of pc.getSenders()) sender.replaceTrack(null).catch(() => undefined);
    }
  }

  /** Receives a track from the remote side. */
  onTrack(stream: MediaStream): void {
    this.remoteStream = stream;
    this.handlers.onState(this.remoteId, true, 'alive');
    this.handlers.onRemoteStream?.(this.remoteId, stream);
  }

  get getTrack(): MediaStream | null {
    return this.stream;
  }

  get receivedTrack(): MediaStream | null {
    return this.remoteStream;
  }

  async handleSignal(message: VoiceSignal): Promise<void> {
    if (message.kind === 'state') {
      this.handlers.onState(
        message.from ?? this.remoteId,
        Boolean(message.publishing),
        message.audience ?? 'alive',
      );
      return;
    }
    if (message.kind === 'bye') {
      this.close();
      return;
    }
    const pc = this.ensureConnection();
    if (message.kind === 'offer' && message.sdp) {
      await pc.setRemoteDescription({ type: 'offer', sdp: message.sdp });
      await this.flushCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send({ kind: 'answer', from: this.selfId, to: message.from ?? this.remoteId, sdp: answer.sdp ?? '' });
      return;
    }
    if (message.kind === 'answer' && message.sdp) {
      await pc.setRemoteDescription({ type: 'answer', sdp: message.sdp });
      await this.flushCandidates();
      return;
    }
    if (message.kind === 'ice' && message.candidate) {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(message.candidate).catch(() => undefined);
      } else {
        this.pendingCandidates.push(message.candidate);
      }
    }
  }

  private ensureConnection(): RTCPeerConnection {
    if (this.pc) return this.pc;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS.length ? ICE_SERVERS : iceServers() });
    this.pc = pc;
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.send({
        kind: 'ice',
        from: this.selfId,
        to: this.remoteId,
        candidate: event.candidate.toJSON(),
      });
    };
    pc.ontrack = (event) => {
      this.onTrack(event.streams[0] ?? new MediaStream());
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.handlers.onError('voice.connection');
      }
    };
    return pc;
  }

  private async negotiate(): Promise<void> {
    const pc = this.ensureConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send({ kind: 'offer', from: this.selfId, to: this.remoteId, sdp: offer.sdp ?? '' });
  }

  private async flushCandidates(): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    for (const candidate of this.pendingCandidates.splice(0)) {
      await pc.addIceCandidate(candidate).catch(() => undefined);
    }
  }

  close(): void {
    this.stream = null;
    this.pc?.close();
    this.pc = null;
    this.pendingCandidates = [];
  }
}

export interface VoiceHubOptions {
  selfId: string;
  isHost: boolean;
  /** Sends a signal to the host (guest mode). */
  sendToHost: (message: VoiceSignal) => void;
  /** Sends a signal to one guest (host mode). */
  sendToGuest: (peerId: string, message: VoiceSignal) => void;
  onState: (peerId: string, publishing: boolean, audience: 'alive' | 'dead') => void;
  onError: (message: string) => void;
  /** Tells whether the local player may publish right now. */
  canPublish: () => boolean;
  /** Tells whether a remote player belongs to the living or to the dead side. */
  audienceOf: (peerId: string) => 'alive' | 'dead';
  /** Host side: the ids of all connected guests. */
  guestIds: () => string[];
}


/**
 * Connects the local microphone to the room.
 *
 * The host relays every published track to the other participants and keeps
 * the dead side separate: streams of dead players only reach dead players.
 */
export class VoiceHub {
  private readonly options: VoiceHubOptions;

  private readonly peers = new Map<string, VoicePeer>();

  private readonly remoteStreams = new Map<string, MediaStream>();

  private readonly audienceByPeer = new Map<string, 'alive' | 'dead'>();

  private localStream: MediaStream | null = null;

  private publishing = false;

  private muted = false;

  constructor(options: VoiceHubOptions) {
    this.options = options;
  }

  get isPublishing(): boolean {
    return this.publishing;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  streams(): Map<string, MediaStream> {
    return this.remoteStreams;
  }

  /** Requests the microphone and publishes it to the room. */
  async enableMicrophone(): Promise<boolean> {
    if (!this.options.canPublish()) {
      this.options.onError('voice.notNow');
      return false;
    }
    const stream = await requestMicrophone();
    if (!stream) {
      this.options.onError('voice.denied');
      return false;
    }
    this.localStream = stream;
    this.publishing = true;
    this.muted = false;
    const audience = this.options.audienceOf(this.options.selfId);
    try {
      if (this.options.isHost) {
        await this.publishToEveryone(stream, audience);
      } else {
        await this.ensurePeer('host').publish(stream, audience);
      }
    } catch {
      this.options.onError('voice.connection');
      return false;
    }
    return true;
  }

  disableMicrophone(): void {
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) track.stop();
    }
    this.localStream = null;
    this.publishing = false;
    this.options.onState(this.options.selfId, false, 'alive');
    for (const peer of this.peers.values()) peer.stopPublishing();
  }

  /** Mutes the local track without renegotiating. */
  toggleMute(): boolean {
    if (!this.localStream) return false;
    this.muted = !this.muted;
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !this.muted;
    }
    return this.muted;
  }

  async handleSignal(message: VoiceSignal): Promise<void> {
    if (!message) return;
    if (message.kind === 'state') {
      const peerId = message.from ?? 'host';
      this.audienceByPeer.set(peerId, message.audience ?? 'alive');
      this.options.onState(peerId, Boolean(message.publishing), message.audience ?? 'alive');
      if (this.options.isHost && message.publishing) {
        await this.relayAll();
      }
      return;
    }
    const peerId = message.from ?? (this.options.isHost ? 'unknown' : 'host');
    const peer = this.ensurePeer(peerId);
    await peer.handleSignal(message);
    if (this.options.isHost) {
      await this.relayAll();
    }
  }

  /** Host side: publishes the local microphone to every guest. */
  private async publishToEveryone(stream: MediaStream, audience: 'alive' | 'dead'): Promise<void> {
    for (const guestId of this.options.guestIds()) {
      const peer = this.ensurePeer(guestId);
      if (peer.getTrack?.id !== stream.id) {
        await peer.publish(stream, audience).catch(() => undefined);
      }
    }
  }

  /**
   * Host side: makes sure every guest receives the tracks of the other guests.
   * Dead players only talk to dead players.
   */
  private async relayAll(): Promise<void> {
    if (!this.options.isHost) return;
    const guests = this.options.guestIds();
    for (const target of guests) {
      const targetAudience = this.audienceByPeer.get(target) ?? this.options.audienceOf(target);
      const peer = this.ensurePeer(target);
      for (const [sourceId, stream] of this.remoteStreams) {
        if (sourceId === target) continue;
        const sourceAudience = this.audienceByPeer.get(sourceId) ?? 'alive';
        if (sourceAudience !== targetAudience) continue;
        if (peer.getTrack?.id === stream.id) continue;
        await peer.publish(stream, sourceAudience).catch(() => undefined);
      }
    }
  }

  private ensurePeer(peerId: string): VoicePeer {
    const existing = this.peers.get(peerId);
    if (existing) return existing;
    const peer = new VoicePeer({
      selfId: this.options.selfId,
      remoteId: peerId,
      handlers: {
        onState: (remoteId, publishing, audience) => {
          this.options.onState(remoteId, publishing, audience);
        },
        onError: (message) => this.options.onError(message),
        onRemoteStream: (remoteId, stream) => {
          this.remoteStreams.set(remoteId, stream);
          this.options.onState(remoteId, true, this.audienceByPeer.get(remoteId) ?? 'alive');
        },
      },
      send: (message) => {
        if (this.options.isHost) this.options.sendToGuest(peerId, message);
        else this.options.sendToHost(message);
      },
    });
    this.peers.set(peerId, peer);
    return peer;
  }

  /** Removes a participant that left the room. */
  removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    peer?.close();
    this.peers.delete(peerId);
    this.remoteStreams.delete(peerId);
    this.audienceByPeer.delete(peerId);
  }

  close(): void {
    this.disableMicrophone();
    for (const peer of this.peers.values()) peer.close();
    this.peers.clear();
    this.remoteStreams.clear();
  }
}