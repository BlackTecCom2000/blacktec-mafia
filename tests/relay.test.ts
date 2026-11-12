import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDiscoveryServer } from '../server/discovery.mjs';

let server: ReturnType<typeof createDiscoveryServer>['server'];
let baseUrl = '';

async function get(path: string) {
  const response = await fetch(`${baseUrl}${path}`);
  return (await response.json()) as Record<string, unknown>;
}

async function post(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response;
}

beforeAll(async () => {
  server = createDiscoveryServer({ staleMs: 60_000 }).server;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address && typeof address === 'object') baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('the backup channel', () => {
  it('delivers the messages of the guest to the host', async () => {
    await post('/api/relay/room1/guest', { id: 'm1', payload: { kind: 'join', key: 'k1', name: 'Гость' } });
    const pulled = await get('/api/relay/room1/host');
    const actions = (pulled.actions ?? []) as Array<{ id: string; payload: { kind: string } }>;
    expect(actions).toHaveLength(1);
    expect(actions[0]?.id).toBe('m1');
    expect(actions[0]?.payload.kind).toBe('join');

    // The queue is emptied by the pull.
    const again = await get('/api/relay/room1/host');
    expect((again.actions ?? []) as unknown[]).toHaveLength(0);
  });

  it('publishes the snapshot of the host for the guest', async () => {
    const snapshot = { version: 7, phase: 'lobby' };
    await post('/api/relay/room2/host', { snapshot, welcome: { k1: 'g1' } });
    const guest = await get('/api/relay/room2/guest');
    expect(guest.snapshot).toEqual(snapshot);
    expect(guest.welcome).toEqual({ k1: 'g1' });
  });

  it('keeps the rooms apart from each other', async () => {
    await post('/api/relay/room3/host', { snapshot: { version: 1 } });
    const other = await get('/api/relay/room4/guest');
    expect(other.snapshot).toBeNull();
  });

  it('closes a room on request', async () => {
    await post('/api/relay/room5/host', { snapshot: { version: 1 } });
    await post('/api/relay/room5/close', {});
    const after = await get('/api/relay/room5/guest');
    expect(after.snapshot).toBeNull();
  });

  it('never stores a password of a room', async () => {
    await post('/api/rooms', {
      code: 'room6',
      name: 'Комната',
      players: 1,
      maxPlayers: 8,
      hasPassword: true,
      rules: 'custom',
      status: 'open',
      seats: 8,
      password: 'secret42',
    });
    const rooms = (await get('/api/rooms')).rooms as Array<Record<string, unknown>>;
    const room = rooms.find((item) => item.code === 'room6');
    expect(room).toBeTruthy();
    expect(room?.hasPassword).toBe(true);
    expect(JSON.stringify(room)).not.toContain('secret42');
  });
});
