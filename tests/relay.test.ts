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
    await post('/api/relay/room1/guest', {
      id: 'm1',
      key: 'k1',
      payload: { kind: 'join', name: 'Гость' },
    });
    const pulled = await get('/api/relay/room1/host');
    const actions = (pulled.actions ?? []) as Array<{
      id: string;
      key: string;
      payload: { kind: string };
    }>;
    expect(actions).toHaveLength(1);
    expect(actions[0]?.id).toBe('m1');
    expect(actions[0]?.key).toBe('k1');
    expect(actions[0]?.payload.kind).toBe('join');

    // The queue is emptied by the pull.
    const again = await get('/api/relay/room1/host');
    expect((again.actions ?? []) as unknown[]).toHaveLength(0);
  });

  it('publishes a personal view for every guest', async () => {
    const views = {
      k1: { version: 7, phase: 'lobby', me: { role: 'mafia' } },
      k2: { version: 7, phase: 'lobby', me: { role: 'citizen' } },
    };
    await post('/api/relay/room2/host', {
      views,
      welcome: { k1: 'g1', k2: 'g2' },
      voice: {},
      errors: {},
    });
    const guest = await get('/api/relay/room2/guest');
    const published = guest.views as Record<string, { me: { role: string } }>;
    // Every guest sees its own role, not the role of the host.
    expect(published.k1?.me.role).toBe('mafia');
    expect(published.k2?.me.role).toBe('citizen');
    expect(guest.welcome).toEqual({ k1: 'g1', k2: 'g2' });
  });

  it('keeps the rooms apart from each other', async () => {
    await post('/api/relay/room3/host', { views: { k1: { version: 1 } } });
    const other = await get('/api/relay/room4/guest');
    expect(Object.keys((other.views ?? {}) as Record<string, unknown>)).toHaveLength(0);
  });

  it('closes a room on request', async () => {
    await post('/api/relay/room5/host', { views: { k1: { version: 1 } } });
    await post('/api/relay/room5/close', {});
    const after = await get('/api/relay/room5/guest');
    expect(Object.keys((after.views ?? {}) as Record<string, unknown>)).toHaveLength(0);
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
