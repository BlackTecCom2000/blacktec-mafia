/** Input hygiene: everything that comes from a player is trimmed, capped and
 *  rendered as text — never as markup. */

/** Maximum length of a player name. */
export const NAME_MAX = 18;
/** Maximum length of a chat message. */
export const MESSAGE_MAX = 180;
/** Maximum length of a room name. */
export const ROOM_NAME_MAX = 40;

/** Removes control characters and trims the value. */
export function cleanText(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

/** A safe player name: no control characters, capped length, no markup. */
export function cleanName(value: string): string {
  return cleanText(value, NAME_MAX);
}

/** A safe chat message. */
export function cleanMessage(value: string): string {
  return cleanText(value, MESSAGE_MAX);
}

/** A safe room name. */
export function cleanRoomName(value: string): string {
  return cleanText(value, ROOM_NAME_MAX);
}

/**
 * Validates the address of the discovery service.
 * Only http(s) is allowed, so a `javascript:` or `data:` address can never
 * reach a fetch or a link.
 */
export function safeServiceUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.origin + url.pathname.replace(/\/+$/, '');
}

/** True when the value looks like markup that should never be rendered as text. */
export function containsMarkup(value: string): boolean {
  return /[<>]/.test(value);
}
