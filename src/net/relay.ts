import type { Action } from '../game/types';
import type { GameView } from '../game/view';
import type { VoiceSignal } from './voice';

/** What the guest sends through the backup channel. */
export type RelayPayload =
  | { kind: 'join'; name: string; password: string | null }
  | { kind: 'action'; action: Action }
  | { kind: 'voice'; signal: VoiceSignal };

/** A message of a guest, waiting in the queue of the host. */
export interface RelayEntry {
  id: string;
  /** The key of the guest that sent the message. */
  key: string;
  payload: RelayPayload | null;
}

/** A voice signal of the host, with a number so the guest handles it once. */
export interface RelayVoice {
  seq: number;
  signal: VoiceSignal;
}

/** What the host publishes for the guests. */
export interface RelayState {
  /** A personal view per guest — every guest sees only its own role. */
  views: Record<string, GameView>;
  /** The seat of every guest, by its key. */
  welcome: Record<string, string>;
  /** The voice signals of the host, by the key of the guest. */
  voice: Record<string, RelayVoice>;
  /** The last rejected action of every guest, by its key. */
  errors: Record<string, string>;
  /** When the host published the state the last time (the service knows it). */
  updatedAt?: number;
}

/**
 * Backup channel through the room service.
 *
 * The direct peer connection does not come through in every network: behind a
 * symmetric NAT (common on mobile) the ICE candidates cannot be used. The
 * service relays the game messages, so the room stays reachable everywhere.
 *
 * The host publishes a personal view for every guest — the roles of the other
 * players stay secret, exactly as with a direct connection.
 */
export class RelayClient {
  private readonly baseUrl: string;

  private readonly code: string;

  constructor(baseUrl: string, code: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.code = code;
  }

  get enabled(): boolean {
    return this.baseUrl.length > 0 && this.code.length > 0;
  }

  /** The number of the failed requests in a row. */
  private failures = 0;

  /** How many requests failed in a row. */
  get errorCount(): number {
    return this.failures;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
      // The service answers with an error when its daily quota is used up —
      // then the room waits longer instead of hammering the service.
      if (response.ok) this.failures = 0;
      else this.failures += 1;
      return response;
    } catch {
      this.failures += 1;
      throw new Error('relay.unreachable');
    } finally {
      window.clearTimeout(timer);
    }
  }

  /** How long the room waits before the next request. */
  get delay(): number {
    if (this.failures === 0) return 0;
    return Math.min(30_000, 2000 * 2 ** Math.min(4, this.failures - 1));
  }

  /**
   * The host publishes the views of the guests and collects their messages in
   * one request — the daily quota of the service is small, so every request
   * that can be spared is spared.
   */
  async push(state: RelayState): Promise<RelayEntry[]> {
    if (!this.enabled) return [];
    const response = await this.request(`/api/relay/${this.code}/host`, {
      method: 'POST',
      body: JSON.stringify(state),
    }).catch(() => null);
    if (!response || !response.ok) return [];
    const payload = (await response.json().catch(() => null)) as { actions?: RelayEntry[] } | null;
    return payload?.actions ?? [];
  }

  /**
   * The guest sends its message and reads the state of the host in one
   * request — the daily quota of the service is small, so every request that
   * can be spared is spared.
   */
  async exchange(key: string, id: string | null, payload: RelayPayload | null): Promise<RelayState> {
    const empty: RelayState = { views: {}, welcome: {}, voice: {}, errors: {} };
    if (!this.enabled) return empty;
    const response = await this.request(`/api/relay/${this.code}/guest`, {
      method: 'POST',
      body: JSON.stringify({ id, key, payload }),
    }).catch(() => null);
    if (!response || !response.ok) return empty;
    const body = (await response.json().catch(() => null)) as Partial<RelayState> | null;
    return {
      views: body?.views ?? {},
      welcome: body?.welcome ?? {},
      voice: body?.voice ?? {},
      errors: body?.errors ?? {},
      updatedAt: body?.updatedAt ?? 0,
    };
  }

  /** The guest sends a message. */
  async send(key: string, id: string, payload: RelayPayload): Promise<void> {
    if (!this.enabled) return;
    await this.request(`/api/relay/${this.code}/guest`, {
      method: 'POST',
      body: JSON.stringify({ id, key, payload }),
    }).catch(() => undefined);
  }

  /** Either side leaves the room. */
  async close(): Promise<void> {
    if (!this.enabled) return;
    await this.request(`/api/relay/${this.code}/close`, { method: 'POST' }).catch(() => undefined);
  }
}
