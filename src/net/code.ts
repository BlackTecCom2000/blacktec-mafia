/** Small helpers shared by the menu/lobby and the PeerJS transport.
 *  Kept separate so the UI does not pull `peerjs` into the initial bundle. */

export const PEER_PREFIX = 'btcmafia1-';

export function normalizeCode(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 5);
}

export function inviteLink(code: string): string {
  if (typeof window === 'undefined') return `#/join/${code}`;
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/join/${code}`;
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
