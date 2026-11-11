import type { RoomListing } from './rooms';

/**
 * Client of the optional room-discovery service.
 *
 * PeerJS cannot enumerate rooms — every host is an anonymous peer id — so the
 * catalog needs a small registry. The service only ever receives public
 * metadata (never a password, never the players' identities).
 */

const DEFAULT_BASE = import.meta.env.VITE_DISCOVERY_URL ?? '';
const STORAGE_KEY = 'btcmafia.discovery';

/** The discovery service address the player uses (stored per browser). */
export function storedDiscoveryUrl(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;
  }
}

export function storeDiscoveryUrl(url: string): void {
  try {
    if (url) window.localStorage.setItem(STORAGE_KEY, url);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage disabled */
  }
}

export class Discovery {
  baseUrl: string;

  constructor(baseUrl: string = storedDiscoveryUrl()) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /** Points the client at another service (e.g. a public instance). */
  setBaseUrl(url: string): void {
    this.baseUrl = url.trim().replace(/\/+$/, '');
  }

  get available(): boolean {
    return this.baseUrl.length > 0;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
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

  async list(): Promise<RoomListing[]> {
    if (!this.available) return [];
    const response = await this.request('/api/rooms');
    if (!response.ok) throw new Error('discovery.list');
    const payload = (await response.json()) as { rooms?: RoomListing[] };
    return Array.isArray(payload.rooms) ? payload.rooms : [];
  }

  /** Registers or updates the room of this host. */
  async publish(listing: RoomListing): Promise<void> {
    if (!this.available) return;
    const response = await this.request('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(listing),
    });
    if (!response.ok) throw new Error('discovery.publish');
  }

  async unpublish(code: string): Promise<void> {
    if (!this.available) return;
    await this.request(`/api/rooms/${encodeURIComponent(code)}`, { method: 'DELETE' });
  }

  /**
   * Removes the room right away — used when the host closes the tab.
   * `sendBeacon` survives the unload of the page, a plain fetch would not.
   */
  closeNow(code: string): void {
    if (!this.available) return;
    const url = `${this.baseUrl}/api/rooms/${encodeURIComponent(code)}/close`;
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      // A body without a content type avoids the CORS preflight, so the
      // request survives the unload of the page.
      navigator.sendBeacon(url);
      return;
    }
    void this.request(`/api/rooms/${encodeURIComponent(code)}/close`, { method: 'POST' }).catch(
      () => undefined,
    );
  }
}

export const discovery = new Discovery();
