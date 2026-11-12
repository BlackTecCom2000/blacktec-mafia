/** Small helpers shared by the menu/lobby and the PeerJS transport.
 *  Kept separate so the UI does not pull `peerjs` into the initial bundle. */

export const PEER_PREFIX = 'btcmafia1-';

/** The public address of the site, used for the invite links of a local build. */
const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL ?? '').replace(/\/+$/, '');
const SERVICE_KEY = 'btcmafia.discovery';

export function normalizeCode(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 5);
}

/** True when the page runs on the computer of the host. */
export function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false;
  const { hostname } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * The address of the room service that was baked into the build.
 * A loopback address only makes sense on the machine that runs the service,
 * so a published build never tries to reach the visitor's localhost.
 */
function bakedServiceUrl(): string {
  const base = (import.meta.env.VITE_DISCOVERY_URL ?? '').trim().replace(/\/+$/, '');
  if (!base) return '';
  const isLoopback = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(base);
  if (!isLoopback) return base;
  const host = typeof window === 'undefined' ? '' : window.location.hostname;
  return host === '127.0.0.1' || host === 'localhost' ? base : '';
}

/**
 * The address of the room service, remembered in the browser.
 * The invite link carries it, so a guest gets the backup channel without
 * configuring anything. When nothing was configured, the address of the build
 * is used — a published build then works right away.
 */
export function storedServiceUrl(): string {
  try {
    return window.localStorage.getItem(SERVICE_KEY) || bakedServiceUrl();
  } catch {
    return bakedServiceUrl();
  }
}

/**
 * The link a guest opens. On a local build the address would point at the
 * computer of the host, so the configured public address is used instead.
 */
export function inviteLink(code: string): string {
  if (typeof window === 'undefined') return `#/join/${code}`;
  const service = storedServiceUrl();
  const query = service ? `?service=${encodeURIComponent(service)}` : '';
  if (isLocalHost() && PUBLIC_URL) {
    return `${PUBLIC_URL}/#/join/${code}${query}`;
  }
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/join/${code}${query}`;
}

/** Reads the code and the service address from an invite link. */
export function parseInviteHash(hash: string): { code: string; service: string } {
  const match = hash.match(/^#\/join\/([a-z0-9]{1,12})(?:\?service=(.+))?$/i);
  if (!match?.[1]) return { code: '', service: '' };
  let service = '';
  if (match[2]) {
    try {
      service = decodeURIComponent(match[2]);
    } catch {
      service = '';
    }
  }
  return { code: match[1].toLowerCase(), service };
}

/** A warning for the host when the invite link only works locally. */
export function inviteLinkIsLocal(): boolean {
  return isLocalHost() && !PUBLIC_URL;
}

export function isSecureContextOk(): boolean {
  if (typeof window === 'undefined') return true;
  const { protocol, hostname } = window.location;
  return (
    protocol === 'https:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  );
}
