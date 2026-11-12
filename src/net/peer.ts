import Peer, { type DataConnection } from 'peerjs';
import type { Action } from '../game/types';
import type { GameView } from '../game/view';
import { PEER_PREFIX } from './code';
import type { VoiceSignal } from './voice';

export type ClientMessage =
  | { t: 'hello'; name: string; password?: string }
  | { t: 'action'; action: Action }
  | { t: 'ping' }
  | { t: 'pong' }
  | { t: 'bye' }
  | { t: 'voice'; message: VoiceSignal };

export type HostMessage =
  | { t: 'welcome'; youId: string; code: string }
  | { t: 'view'; view: GameView }
  | { t: 'reject'; error: string }
  | { t: 'closed'; error: string }
  | { t: 'actionError'; error: string }
  | { t: 'ping' }
  | { t: 'pong' }
  | { t: 'voice'; message: VoiceSignal };

export type NetStatus = 'connecting' | 'ready' | 'error';

/** How long a guest may stay silent before the host treats it as gone. */
const SILENCE_LIMIT = 30_000;

/** How often the host pings its guests. */
const PING_INTERVAL = 5_000;

/** Failed join attempts (wrong password) allowed per connection. */
export const MAX_JOIN_ATTEMPTS = 5;

/** How long a guest waits for the direct peer connection. */
export const CONNECT_TIMEOUT = 12_000;

/**
 * ICE servers for the direct peer connection.
 *
 * Without a TURN relay the connection only works when both peers can reach
 * each other directly. Mobile networks and symmetric NAT block that, so the
 * room stays unreachable. Configure a TURN server to make it reliable:
 *
 *   VITE_TURN_URL=turn:turn.example.com:3478
 *   VITE_TURN_USERNAME=...
 *   VITE_TURN_CREDENTIAL=...
 *
 * With `VITE_TURN=none` the public fallback relays are switched off.
 */
export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  const url = import.meta.env.VITE_TURN_URL;
  if (url === 'none') return servers;
  if (url) {
    servers.push({
      urls: url,
      username: import.meta.env.VITE_TURN_USERNAME || undefined,
      credential: import.meta.env.VITE_TURN_CREDENTIAL || undefined,
    });
    return servers;
  }
  // Public fallback relays: they help peers behind a symmetric NAT.
  servers.push({
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
    username: 'openrelay',
    credential: 'openrelay',
  });
  return servers;
}

function makeCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(5);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += alphabet[(bytes[i] ?? 0) % alphabet.length];
  return out;
}

interface HostHandlers {
  /** Returns an error code when the player cannot join. */
  onJoin(playerId: string, name: string, password: string | null): string | null;
  onMessage(playerId: string, message: ClientMessage): void;
  onLeave(playerId: string): void;
  onVoice?: (playerId: string, message: VoiceSignal) => void;
}

export class HostNet {
  code: string | null = null;

  private peer: Peer | null = null;

  private readonly conns = new Map<DataConnection, string>();

  private readonly byPlayer = new Map<string, DataConnection>();

  /** Last moment we heard something from a guest. */
  private readonly lastSeen = new Map<string, number>();

  /** Failed join attempts per connection (brute force protection). */
  private readonly attempts = new Map<DataConnection, number>();

  private heartbeat: number | null = null;

  private readonly handlers: HostHandlers;

  private guestSeq = 0;

  private stopped = false;

  constructor(handlers: HostHandlers) {
    this.handlers = handlers;
  }

  async start(): Promise<string> {
    let lastError = 'net.error';
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const code = makeCode();
      try {
        const peer = await openPeer(PEER_PREFIX + code, 14000);
        if (this.stopped) {
          peer.destroy();
          throw new Error('stopped');
        }
        this.peer = peer;
        this.code = code;
        peer.on('connection', (conn) => this.attach(conn));
        peer.on('error', (error) => {
          const type = (error as { type?: string }).type;
          if (type === 'unavailable-id') {
            lastError = 'net.error';
          } else if (type === 'network' || type === 'server-error' || type === 'socket-error') {
            lastError = 'net.server';
          }
          if (!this.stopped) console.warn('[net] host error', type, error);
        });
        peer.on('disconnected', () => {
          if (!this.stopped) peer.reconnect();
        });
        this.heartbeat = window.setInterval(() => this.sweep(), PING_INTERVAL);
        return code;
      } catch (error) {
        lastError = errorMessage(error);
        if (!String(error).includes('unavailable-id')) {
          if (attempt >= 1) break;
        }
      }
    }
    throw new Error(lastError);
  }

  private attach(conn: DataConnection) {
    this.conns.set(conn, '');
    conn.on('data', (raw) => this.handleData(conn, raw));
    conn.on('close', () => this.drop(conn));
    conn.on('error', () => this.drop(conn));
  }

  private handleData(conn: DataConnection, raw: unknown) {
    let message: ClientMessage;
    try {
      message = typeof raw === 'string' ? (JSON.parse(raw) as ClientMessage) : (raw as ClientMessage);
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;

    if (message.t === 'hello') {
      if (this.conns.get(conn)) return;
      const attempts = (this.attempts.get(conn) ?? 0) + 1;
      this.attempts.set(conn, attempts);
      if (attempts > MAX_JOIN_ATTEMPTS) {
        try {
          conn.close();
        } catch {
          /* ignore */
        }
        return;
      }
      this.guestSeq += 1;
      const playerId = `g${this.guestSeq}`;
      const error = this.handlers.onJoin(
        playerId,
        String(message.name ?? '').slice(0, 18),
        message.password ? String(message.password) : null,
      );
      if (error) {
        // The connection stays open so the guest may retry with a password.
        this.sendRaw(conn, { t: 'reject', error });
        return;
      }
      this.conns.set(conn, playerId);
      this.byPlayer.set(playerId, conn);
      this.lastSeen.set(playerId, Date.now());
      this.sendRaw(conn, { t: 'welcome', youId: playerId, code: this.code ?? '' });
      return;
    }

    const playerId = this.conns.get(conn);
    if (!playerId) return;
    this.lastSeen.set(playerId, Date.now());

    if (message.t === 'pong') return;
    if (message.t === 'ping') {
      this.sendRaw(conn, { t: 'pong' });
      return;
    }
    if (message.t === 'bye') {
      this.drop(conn);
      return;
    }
    if (message.t === 'voice') {
      this.handlers.onVoice?.(playerId, message.message);
      return;
    }
    this.handlers.onMessage(playerId, message);
  }

  /** Pings every guest and forgets the ones that went silent. */
  private sweep(): void {
    if (this.stopped) return;
    const now = Date.now();
    for (const [playerId, conn] of [...this.byPlayer]) {
      const seen = this.lastSeen.get(playerId) ?? 0;
      if (now - seen > SILENCE_LIMIT) {
        try {
          conn.close();
        } catch {
          /* ignore */
        }
        this.drop(conn);
        continue;
      }
      this.sendRaw(conn, { t: 'ping' });
    }
  }

  send(playerId: string, message: HostMessage) {
    const conn = this.byPlayer.get(playerId);
    if (conn && conn.open) {
      try {
        conn.send(JSON.stringify(message));
      } catch {
        /* connection dropped mid-send */
      }
    }
  }

  sendRaw(conn: DataConnection, message: HostMessage) {
    if (!conn.open) return;
    try {
      conn.send(JSON.stringify(message));
    } catch {
      /* ignore */
    }
  }

  isPlayerOnline(playerId: string): boolean {
    const conn = this.byPlayer.get(playerId);
    return Boolean(conn?.open);
  }

  private drop(conn: DataConnection) {
    const playerId = this.conns.get(conn);
    this.conns.delete(conn);
    this.attempts.delete(conn);
    if (!playerId) return;
    this.lastSeen.delete(playerId);
    if (this.byPlayer.get(playerId) === conn) this.byPlayer.delete(playerId);
    this.handlers.onLeave(playerId);
  }

  /** Sends a voice signal to a single guest. */
  sendVoice(playerId: string, message: VoiceSignal): void {
    this.send(playerId, { t: 'voice', message });
  }

  /** Sends a voice signal to every guest except the sender. */
  broadcastVoice(senderId: string, message: VoiceSignal): void {
    for (const playerId of this.byPlayer.keys()) {
      if (playerId === senderId) continue;
      this.sendVoice(playerId, message);
    }
  }

  stop() {
    this.stopped = true;
    if (this.heartbeat !== null) {
      window.clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    for (const playerId of [...this.byPlayer.keys()]) {
      this.send(playerId, { t: 'closed', error: 'net.hostLeft' });
    }
    for (const conn of this.byPlayer.values()) {
      try {
        conn.close();
      } catch {
        /* ignore */
      }
    }
    this.byPlayer.clear();
    this.conns.clear();
    this.lastSeen.clear();
    this.attempts.clear();
    this.peer?.destroy();
    this.peer = null;
    this.code = null;
  }
}

interface GuestHandlers {
  onView(view: GameView): void;
  onClose(error: string): void;
  onReject?: (error: string) => void;
  onActionError?: (error: string) => void;
  onVoice?: (message: VoiceSignal) => void;
}

export class GuestNet {
  private peer: Peer | null = null;

  private conn: DataConnection | null = null;

  private readonly handlers: GuestHandlers;

  private closed = false;

  youId: string | null = null;

  private guestName = '';

  constructor(handlers: GuestHandlers) {
    this.handlers = handlers;
  }

  async connect(code: string, name: string, password?: string | null): Promise<void> {
    this.guestName = name;
    // One automatic retry: the first attempt can fail on a stale peer id or a
    // momentary hiccup of the signalling server.
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.connectOnce(code, password ?? null);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('net.error');
        const reason = lastError.message;
        // A wrong password or a full room will not get better with a retry.
        if (reason === 'net.wrongPassword' || reason === 'net.passwordRequired' || reason === 'net.full') {
          throw lastError;
        }
        this.teardownConnection();
      }
    }
    throw lastError ?? new Error('net.error');
  }

  /** Drops the current peer and connection so a retry starts clean. */
  private teardownConnection(): void {
    try {
      this.conn?.close();
    } catch {
      /* ignore */
    }
    try {
      this.peer?.destroy();
    } catch {
      /* ignore */
    }
    this.conn = null;
    this.peer = null;
  }

  private async connectOnce(code: string, password: string | null): Promise<void> {
    const peer = await openPeer(undefined, 15000);
    this.peer = peer;
    const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
    this.conn = conn;

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('net.p2p')), CONNECT_TIMEOUT);
      const cleanup = () => {
        window.clearTimeout(timer);
      };

      conn.on('open', () => {
        this.sendMessage({ t: 'hello', name: this.guestName, password: password ?? undefined });
      });

      conn.on('data', (raw) => {
        let message: HostMessage | null = null;
        try {
          message = typeof raw === 'string' ? (JSON.parse(raw) as HostMessage) : (raw as HostMessage);
        } catch {
          return;
        }
        if (!message || typeof message !== 'object') return;
        if (message.t === 'welcome') {
          this.youId = message.youId;
          cleanup();
          resolve();
          return;
        }
        if (message.t === 'view') {
          this.handlers.onView(message.view);
          return;
        }
        if (message.t === 'ping') {
          this.sendMessage({ t: 'pong' });
          return;
        }
        if (message.t === 'voice') {
          this.handlers.onVoice?.(message.message);
          return;
        }
        if (message.t === 'actionError') {
          this.handlers.onActionError?.(message.error);
          return;
        }
        if (message.t === 'reject') {
          // A password may be missing or wrong: the guest may retry.
          if (message.error === 'net.passwordRequired' || message.error === 'net.wrongPassword') {
            this.handlers.onReject?.(message.error);
            return;
          }
          cleanup();
          reject(new Error(message.error));
          return;
        }
        if (message.t === 'closed') {
          cleanup();
          this.handlers.onClose(message.error);
        }
      });

      conn.on('close', () => {
        cleanup();
        if (!this.closed) this.handlers.onClose('net.closed');
        if (this.youId) resolve();
        else reject(new Error('net.notFound'));
      });

      conn.on('error', (error) => {
        cleanup();
        reject(new Error(errorMessage(error)));
      });

      peer.on('error', (error) => {
        const type = (error as { type?: string }).type;
        cleanup();
        if (type === 'peer-unavailable') reject(new Error('net.notFound'));
        else if (type === 'network' || type === 'server-error') reject(new Error('net.server'));
        else reject(new Error('net.error'));
      });
    });
  }

  send(action: Action) {
    return this.sendMessage({ t: 'action', action });
  }

  /** Retries the join with a password after the host asked for one. */
  retryJoin(password: string): boolean {
    return this.sendMessage({ t: 'hello', name: this.guestName, password });
  }

  /** Sends a voice signal to the host. */
  sendVoice(message: VoiceSignal): boolean {
    return this.sendMessage({ t: 'voice', message });
  }

  /** Tells the host we are leaving on purpose. */
  bye() {
    this.sendMessage({ t: 'bye' });
  }

  private sendMessage(message: ClientMessage): boolean {
    if (!this.conn?.open) return false;
    try {
      this.conn.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  stop() {
    this.closed = true;
    this.bye();
    try {
      this.conn?.close();
    } catch {
      /* ignore */
    }
    this.peer?.destroy();
    this.conn = null;
    this.peer = null;
  }
}

function openPeer(id: string | undefined, timeoutMs: number): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id
      ? new Peer(id, { debug: 0, config: { iceServers: iceServers() } })
      : new Peer({ debug: 0, config: { iceServers: iceServers() } });
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        peer.destroy();
      } catch {
        /* ignore */
      }
      reject(new Error('net.server'));
    }, timeoutMs);

    peer.on('open', () => {
      if (settled) {
        peer.destroy();
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      resolve(peer);
    });

    peer.on('error', (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      const type = (error as { type?: string }).type ?? '';
      try {
        peer.destroy();
      } catch {
        /* ignore */
      }
      reject(new Error(type === 'unavailable-id' ? 'unavailable-id' : errorMessage(error)));
    });
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'net.error';
}
