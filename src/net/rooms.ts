/** Pure helpers for the room catalog and the quick match.
 *  Kept free of browser APIs so the rules can be unit tested. */

export type RoomRules = 'standard' | 'custom';

export type RoomStatus = 'open' | 'ready' | 'playing' | 'full';

export interface RoomListing {
  code: string;
  name: string;
  players: number;
  maxPlayers: number;
  hasPassword: boolean;
  rules: RoomRules;
  status: RoomStatus;
  /** Number of seats the composition provides. */
  seats: number;
  allowIncomplete: boolean;
  updatedAt: number;
}

export type QuickMatchMode = 'standard' | 'custom' | 'any';

export interface QuickMatchPrefs {
  mode: QuickMatchMode;
  /** Desired number of players, if the player picked one. */
  players?: number;
}

export const QUICK_MATCH_INTERVAL = 4000;

/** A room can be entered while it gathers players and still has free seats. */
export function isJoinable(listing: RoomListing): boolean {
  if (listing.status === 'playing' || listing.status === 'full') return false;
  return listing.players < listing.maxPlayers;
}

/** Rooms that are open for anybody (no password) may be used for a quick match. */
export function isOpenForQuickMatch(listing: RoomListing): boolean {
  return !listing.hasPassword && isJoinable(listing) && listing.status === 'open';
}

/** The room rules must fit the mode and the table size the player asked for. */
export function isCompatible(listing: RoomListing, prefs: QuickMatchPrefs): boolean {
  if (prefs.mode !== 'any' && listing.rules !== prefs.mode) return false;
  if (prefs.players && prefs.players > 0) {
    if (listing.maxPlayers < prefs.players) return false;
    if (listing.seats > 0 && listing.seats < prefs.players) return false;
  }
  return true;
}

/** Picks the room that fits best: open, compatible and with the most free seats. */
export function findQuickMatch(
  listings: RoomListing[],
  prefs: QuickMatchPrefs,
): RoomListing | null {
  const candidates = listings.filter(
    (listing) => isOpenForQuickMatch(listing) && isCompatible(listing, prefs),
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => {
    const freeA = a.maxPlayers - a.players;
    const freeB = b.maxPlayers - b.players;
    if (freeA !== freeB) return freeB - freeA;
    return a.updatedAt - b.updatedAt;
  })[0] ?? null;
}

/** The catalog only lists rooms that still accept players. */
export function visibleRooms(listings: RoomListing[]): RoomListing[] {
  return listings
    .filter((listing) => listing.status !== 'playing' && listing.status !== 'full')
    .sort((a, b) => {
      if (a.hasPassword !== b.hasPassword) return a.hasPassword ? 1 : -1;
      return b.updatedAt - a.updatedAt;
    });
}

/** Room status derived from the lobby state. */
export function roomStatus(
  phase: string,
  players: number,
  maxPlayers: number,
  ready: boolean,
): RoomStatus {
  if (phase !== 'lobby') return 'playing';
  if (players >= maxPlayers) return 'full';
  return ready ? 'ready' : 'open';
}

export type JoinAccess = 'ok' | 'passwordRequired' | 'wrongPassword';

/**
 * Checks a joining guest against the room access rules.
 * The password itself never leaves the host.
 */
export function checkJoinAccess(
  settings: { hasPassword: boolean },
  stored: string | null,
  provided: string | null,
): JoinAccess {
  if (!settings.hasPassword) return 'ok';
  if (!provided) return 'passwordRequired';
  if (stored === null || provided !== stored) return 'wrongPassword';
  return 'ok';
}
