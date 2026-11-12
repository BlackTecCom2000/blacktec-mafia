import type { Action } from '../game/types';
import type { GameView } from '../game/view';

/** What the guest sends through the backup channel. */
export type RelayPayload =
  | { kind: 'join'; key: string; name: string; password: string | null }
  | { kind: 'action'; action: Action };

export interface RelayEntry {
  id: string;
  payload: RelayPayload | null;
}

/**
 * Backup channel through the room service.
 *
 * The direct peer connection does not come through in every network: behind a
 * symmetric NAT (common on mobile) the ICE candidates cannot be used. The
 * service relays the game messages, so the room stays reachable everywhere.
 */
export class RelayClient {
  private readonly baseUrl: string;

  private readonly code: string;

  constructor(baseUrl: string, code: string, role: 'host' | 'guest') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.code = code;
    this.role = role;
  }

  /** The side of the room this client speaks for. */
  readonly role: 'host' | 'guest';

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

  /** The host publishes its snapshot and the answers of the relay guests. */
  async pushSnapshot(view: GameView, welcome: Record<string, string>): Promise<void> {
    if (!this.enabled) return;
    await this.request(`/api/relay/${this.code}/host`, {
      method: 'POST',
      body: JSON.stringify({ snapshot: view, welcome }),
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
  async send(id: string, payload: RelayPayload): Promise<void> {
    if (!this.enabled) return;
    await this.request(`/api/relay/${this.code}/guest`, {
      method: 'POST',
      body: JSON.stringify({ id, payload }),
    }).catch(() => undefined);
  }

  /** The guest reads the snapshot of the host and its own seat. */
  async pull(): Promise<{ snapshot: GameView | null; welcome: Record<string, string> }> {
    if (!this.enabled) return { snapshot: null, welcome: {} };
    const response = await this.request(`/api/relay/${this.code}/guest`).catch(() => null);
    if (!response || !response.ok) return { snapshot: null, welcome: {} };
    const payload = (await response.json().catch(() => null)) as
      | { snapshot?: GameView | null; welcome?: Record<string, string> }
      | null;
    return { snapshot: payload?.snapshot ?? null, welcome: payload?.welcome ?? {} };
  }

  /** Either side leaves the room. */
  async close(): Promise<void> {
    if (!this.enabled) return;
    await this.request(`/api/relay/${this.code}/close`, { method: 'POST' }).catch(() => undefined);
  }
}
