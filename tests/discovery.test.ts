import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDiscoveryServer, type DiscoveryRoom } from '../server/discovery.mjs';

let server: ReturnType<typeof createDiscoveryServer>['server'];
let baseUrl = '';

function room(overrides: Partial<DiscoveryRoom> = {}): DiscoveryRoom {
  return {
    code: 'abcde',
    name: 'Серый переулок',
    players: 2,
    maxPlayers: 8,
    hasPassword: false,
    rules: 'standard',
    status: 'open',
    seats: 8,
    allowIncomplete: false,
    updatedAt: Date.now(),
    ...overrides,
  };
}

async function list(): Promise<DiscoveryRoom[]> {
  const response = await fetch(`${baseUrl}/api/rooms`);
  const payload = (await response.json()) as { rooms: DiscoveryRoom[] };
  return payload.rooms;
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

describe('discovery service', () => {
  it('publishes a room and lists it', async () => {
    const response = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(room({ code: 'live1' })),
    });
    expect(response.status).toBe(200);
    const rooms = await list();
    expect(rooms.map((item) => item.code)).toContain('live1');
  });

  it('never stores a password', async () => {
    await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...room({ code: 'safe1' }), password: 'secret42' }),
    });
    const rooms = await list();
    const stored = rooms.find((item) => item.code === 'safe1');
    expect(stored).toBeTruthy();
    expect(stored).not.toHaveProperty('password');
    expect(JSON.stringify(stored)).not.toContain('secret42');
  });

  it('removes the room right away when the host closes it', async () => {
    await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(room({ code: 'close1' })),
    });
    expect((await list()).map((item) => item.code)).toContain('close1');

    await fetch(`${baseUrl}/api/rooms/close1/close`, { method: 'POST' });
    expect((await list()).map((item) => item.code)).not.toContain('close1');
  });

  it('removes a room with the delete endpoint as well', async () => {
    await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(room({ code: 'del001' })),
    });
    await fetch(`${baseUrl}/api/rooms/del001`, { method: 'DELETE' });
    expect((await list()).map((item) => item.code)).not.toContain('del001');
  });

  it('drops rooms that stopped refreshing themselves', async () => {
    const local = createDiscoveryServer({ staleMs: 50 });
    await new Promise<void>((resolve) => local.server.listen(0, '127.0.0.1', resolve));
    const address = local.server.address();
    const url = address && typeof address === 'object' ? `http://127.0.0.1:${address.port}` : '';
    await fetch(`${url}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(room({ code: 'ghost1' })),
    });
    expect((await (await fetch(`${url}/api/rooms`)).json() as { rooms: DiscoveryRoom[] }).rooms).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const after = (await (await fetch(`${url}/api/rooms`)).json()) as { rooms: DiscoveryRoom[] };
    expect(after.rooms).toHaveLength(0);
    await new Promise<void>((resolve) => local.server.close(() => resolve()));
  });

  it('rejects rooms with a broken payload', async () => {
    const response = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '!!!', name: 'broken' }),
    });
    expect(response.status).toBe(400);
  });
});
