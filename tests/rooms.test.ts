import { describe, expect, it } from 'vitest';
import {
  checkJoinAccess,
  findQuickMatch,
  isCompatible,
  isJoinable,
  isOpenForQuickMatch,
  roomStatus,
  visibleRooms,
  type RoomListing,
} from '../src/net/rooms';

function listing(overrides: Partial<RoomListing> = {}): RoomListing {
  return {
    code: 'abcde',
    name: 'Серый переулок',
    players: 3,
    maxPlayers: 8,
    hasPassword: false,
    rules: 'standard',
    status: 'open',
    seats: 8,
    allowIncomplete: false,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('room catalog', () => {
  it('only lists rooms that still accept players', () => {
    const rooms = [
      listing({ code: 'aaaaa' }),
      listing({ code: 'bbbbb', status: 'playing' }),
      listing({ code: 'ccccc', status: 'full' }),
    ];
    const visible = visibleRooms(rooms);
    expect(visible.map((room) => room.code)).toEqual(['aaaaa']);
  });

  it('marks rooms with a password as closed but keeps them visible', () => {
    const rooms = visibleRooms([listing({ code: 'aaaaa', hasPassword: true })]);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.hasPassword).toBe(true);
    expect(isJoinable(rooms[0]!)).toBe(true);
  });

  it('does not allow joining a running or full room', () => {
    expect(isJoinable(listing({ status: 'playing' }))).toBe(false);
    expect(isJoinable(listing({ status: 'full' }))).toBe(false);
    expect(isJoinable(listing({ players: 8, maxPlayers: 8 }))).toBe(false);
    expect(isJoinable(listing({ players: 7, maxPlayers: 8 }))).toBe(true);
  });

  it('derives the room status from the lobby state', () => {
    expect(roomStatus('lobby', 2, 8, false)).toBe('open');
    expect(roomStatus('lobby', 8, 8, true)).toBe('full');
    expect(roomStatus('lobby', 8, 8, false)).toBe('full');
    expect(roomStatus('lobby', 5, 8, true)).toBe('ready');
    expect(roomStatus('night', 5, 8, true)).toBe('playing');
  });
});

describe('quick match', () => {
  it('never picks a room with a password', () => {
    const rooms = [listing({ code: 'aaaaa', hasPassword: true })];
    expect(isOpenForQuickMatch(rooms[0]!)).toBe(false);
    expect(findQuickMatch(rooms, { mode: 'any' })).toBeNull();
  });

  it('never picks a room that already started', () => {
    const rooms = [listing({ code: 'aaaaa', status: 'playing' })];
    expect(findQuickMatch(rooms, { mode: 'any' })).toBeNull();
  });

  it('respects the chosen rules', () => {
    const rooms = [
      listing({ code: 'stdr00', rules: 'standard' }),
      listing({ code: 'cust00', rules: 'custom' }),
    ];
    expect(findQuickMatch(rooms, { mode: 'standard' })?.code).toBe('stdr00');
    expect(findQuickMatch(rooms, { mode: 'custom' })?.code).toBe('cust00');
    expect(findQuickMatch(rooms, { mode: 'any' })?.code).toBe('stdr00');
  });

  it('respects the chosen table size', () => {
    const rooms = [
      listing({ code: 'small00', maxPlayers: 6, seats: 6 }),
      listing({ code: 'large00', maxPlayers: 12, seats: 12 }),
    ];
    expect(findQuickMatch(rooms, { mode: 'any', players: 10 })?.code).toBe('large00');
    expect(isCompatible(rooms[0]!, { mode: 'any', players: 10 })).toBe(false);
    expect(isCompatible(rooms[1]!, { mode: 'any', players: 10 })).toBe(true);
  });

  it('prefers the room with the most free seats', () => {
    const rooms = [
      listing({ code: 'busy000', players: 7, maxPlayers: 8 }),
      listing({ code: 'free000', players: 1, maxPlayers: 8 }),
    ];
    expect(findQuickMatch(rooms, { mode: 'any' })?.code).toBe('free000');
  });

  it('returns nothing when no room fits', () => {
    expect(findQuickMatch([], { mode: 'any' })).toBeNull();
  });
});

describe('room access', () => {
  it('lets guests into an open room', () => {
    expect(checkJoinAccess({ hasPassword: false }, null, null)).toBe('ok');
    expect(checkJoinAccess({ hasPassword: false }, null, 'anything')).toBe('ok');
  });

  it('asks for the password of a protected room', () => {
    expect(checkJoinAccess({ hasPassword: true }, 'secret', null)).toBe('passwordRequired');
  });

  it('rejects a wrong password', () => {
    expect(checkJoinAccess({ hasPassword: true }, 'secret', 'wrong')).toBe('wrongPassword');
  });

  it('accepts the correct password', () => {
    expect(checkJoinAccess({ hasPassword: true }, 'secret', 'secret')).toBe('ok');
  });
});
