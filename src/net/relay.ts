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

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
    } finally {
      window.clearTimeout(timer);
    }
  }

  /** The host publishes the views of the guests and the answers for them. */
  async push(state: RelayState): Promise<void> {
    if (!this.enabled) return;
    await this.request(`/api/relay/${this.code}/host`, {
      method: 'POST',
      body: JSON.stringify(state),
    }).catch(() => undefined);
  }

  /** The host collects the messages of the guests. */
  async pullMessages(): Promise<RelayEntry[]> {
    if (!this.enabled) return [];
    const response = await this.request(`/api/relay/${this.code}/host`).catch(() => null);
    if (!response || !response.ok) return [];
    const payload = (await response.json().catch(() => null)) as { actions?: RelayEntry[] } | null;
    return payload?.actions ?? [];
  }

  /** The guest sends a message. */
  async send(key: string, id: string, payload: RelayPayload): Promise<void> {
    if (!this.enabled) return;
    await this.request(`/api/relay/${this.code}/guest`, {
      method: 'POST',
      body: JSON.stringify({ id, key, payload }),
    }).catch(() => undefined);
  }

  /** The guest reads the state of the host and its own view. */
  async pull(): Promise<RelayState> {
    const empty: RelayState = { views: {}, welcome: {}, voice: {}, errors: {} };
    if (!this.enabled) return empty;
    const response = await this.request(`/api/relay/${this.code}/guest`).catch(() => null);
    if (!response || !response.ok) return empty;
    const payload = (await response.json().catch(() => null)) as Partial<RelayState> | null;
    return {
      views: payload?.views ?? {},
      welcome: payload?.welcome ?? {},
      voice: payload?.voice ?? {},
      errors: payload?.errors ?? {},
    };
  }

  /** Either side leaves the room. */
  async close(): Promise<void> {
    if (!this.enabled) return;
    await this.request(`/api/relay/${this.code}/close`, { method: 'POST' }).catch(() => undefined);
  }
}
