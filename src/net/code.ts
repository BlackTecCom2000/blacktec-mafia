/** Small helpers shared by the menu/lobby and the PeerJS transport.
 *  Kept separate so the UI does not pull `peerjs` into the initial bundle. */

export const PEER_PREFIX = 'btcmafia1-';

/** The public address of the site, used for the invite links of a local build. */
const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL ?? '').replace(/\/+$/, '');

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
 * The link a guest opens. On a local build the address would point at the
 * computer of the host, so the configured public address is used instead.
 */
export function inviteLink(code: string): string {
  if (typeof window === 'undefined') return `#/join/${code}`;
  if (isLocalHost() && PUBLIC_URL) {
    return `${PUBLIC_URL}/#/join/${code}`;
  }
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/join/${code}`;
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
