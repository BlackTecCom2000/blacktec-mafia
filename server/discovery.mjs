/**
 * Room discovery service for BlackTec Mafia.
 *
 * PeerJS cannot enumerate rooms — every host is an anonymous peer id — so the
 * catalog of open rooms needs a small registry. The service only ever stores
 * public metadata: the room code, the name, the player count, the rules and the
 * fact that a room is password protected. It never receives a password, a
 * player name or anything else that identifies a person.
 *
 * Run it with:  node server/discovery.mjs        (PORT=8787 by default)
 * Point the app at it with: VITE_DISCOVERY_URL=http://localhost:8787
 */

import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
/** Rooms that did not refresh themselves in this time are dropped. */
export const STALE_MS = 30_000;
const MAX_ROOMS = 500;

function sanitize(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const code = String(payload.code ?? '').trim().toLowerCase();
  if (!/^[a-z0-9]{4,12}$/.test(code)) return null;
  const players = clampInt(payload.players, 0, 64);
  const maxPlayers = clampInt(payload.maxPlayers, 2, 64);
  return {
    code,
    name: String(payload.name ?? '').slice(0, 40),
    players,
    maxPlayers,
    hasPassword: Boolean(payload.hasPassword),
    rules: payload.rules === 'custom' ? 'custom' : 'standard',
    status: ['open', 'ready', 'playing', 'full'].includes(payload.status) ? payload.status : 'open',
    seats: clampInt(payload.seats, 0, 64),
    allowIncomplete: Boolean(payload.allowIncomplete),
    updatedAt: Date.now(),
  };
}

function clampInt(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

/** Creates the discovery service. Exported so the tests can run it. */
export function createDiscoveryServer(options = {}) {
  const staleMs = options.staleMs ?? STALE_MS;
  const rooms = new Map();

  function prune() {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (now - room.updatedAt > staleMs) rooms.delete(code);
    }
  }

  function send(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    });
    res.end(payload);
  }

  const server = createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      send(res, 204, {});
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/api/rooms') {
      prune();
      send(res, 200, { rooms: [...rooms.values()] });
      return;
    }

    // The host closes its room right away when the tab goes away.
    const closeMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9]+)\/close$/i);
    if ((req.method === 'POST' || req.method === 'DELETE') && closeMatch) {
      rooms.delete(closeMatch[1].toLowerCase());
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/rooms') {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
        if (raw.length > 8192) req.destroy();
      });
      req.on('end', () => {
        let payload = null;
        try {
          payload = JSON.parse(raw);
        } catch {
          send(res, 400, { error: 'bad-json' });
          return;
        }
        const room = sanitize(payload);
        if (!room) {
          send(res, 400, { error: 'bad-room' });
          return;
        }
        prune();
        if (!rooms.has(room.code) && rooms.size >= MAX_ROOMS) {
          send(res, 503, { error: 'too-many-rooms' });
          return;
        }
        rooms.set(room.code, room);
        send(res, 200, { ok: true });
      });
      return;
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/rooms/')) {
      const code = decodeURIComponent(url.pathname.slice('/api/rooms/'.length)).toLowerCase();
      rooms.delete(code);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      send(res, 200, { ok: true, rooms: rooms.size });
      return;
    }

    send(res, 404, { error: 'not-found' });
  });

  return { server, rooms, prune, staleMs };
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;

if (isMain) {
  const { server } = createDiscoveryServer();
  server.listen(PORT, HOST, () => {
    console.log(`[discovery] listening on http://${HOST}:${PORT}`);
  });
}
