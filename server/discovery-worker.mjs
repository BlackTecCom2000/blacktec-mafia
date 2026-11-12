/**
 * BlackTec Mafia — room service for Cloudflare Workers.
 *
 * Two jobs in one worker:
 *  1) the catalog of open rooms, so players can find a table;
 *  2) the backup channel, so a room stays reachable when the direct peer
 *     connection does not come through (symmetric NAT, mobile networks).
 *
 * The state lives in Durable Objects, because the instances of a worker do
 * not share their memory. Every room gets its own object, so the rooms do
 * not block each other; the catalog has one more object for the list.
 */

/** A room that was not updated for this long is considered gone. */
const STALE_MS = 60_000;
/** How many rooms the catalog keeps. */
const MAX_ROOMS = 500;
/** How many messages of the guests are kept per room. */
const MAX_ACTIONS = 200;
/** The maximum size of a snapshot of the host. */
const MAX_SNAPSHOT_BYTES = 128 * 1024;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
  'cache-control': 'no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  });
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

/** Keeps only the public metadata of a room — never a password. */
function sanitizeRoom(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const code = String(payload.code ?? '').trim().toLowerCase();
  if (!/^[a-z0-9]{4,12}$/.test(code)) return null;
  return {
    code,
    name: String(payload.name ?? '').slice(0, 40),
    players: clamp(payload.players, 0, 64),
    maxPlayers: clamp(payload.maxPlayers, 2, 64),
    hasPassword: Boolean(payload.hasPassword),
    rules: payload.rules === 'custom' ? 'custom' : 'standard',
    status: ['open', 'ready', 'playing', 'full'].includes(payload.status) ? payload.status : 'open',
    seats: clamp(payload.seats, 0, 64),
    allowIncomplete: Boolean(payload.allowIncomplete),
    updatedAt: Date.now(),
  };
}

/**
 * The catalog of the open rooms.
 * One object holds the whole list, so the list never loses a room.
 */
export class Catalog {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async all() {
    const stored = (await this.ctx.storage.get('rooms')) ?? {};
    const now = Date.now();
    const fresh = {};
    for (const [code, room] of Object.entries(stored)) {
      if (now - room.updatedAt > STALE_MS) continue;
      fresh[code] = room;
    }
    return { fresh, changed: Object.keys(fresh).length !== Object.keys(stored).length };
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (path === '/api/rooms') {
      if (request.method === 'GET') {
        const { fresh } = await this.all();
        return json({ rooms: Object.values(fresh) });
      }
      if (request.method === 'POST') {
        const payload = await request.json().catch(() => null);
        const room = sanitizeRoom(payload);
        if (!room) return json({ error: 'bad-room' }, 400);
        const { fresh, changed } = await this.all();
        if (!fresh[room.code] && Object.keys(fresh).length >= MAX_ROOMS) {
          return json({ error: 'too-many-rooms' }, 503);
        }
        fresh[room.code] = room;
        await this.ctx.storage.put('rooms', fresh);
        void changed;
        return json({ ok: true });
      }
      return json({ error: 'method' }, 405);
    }

    const closeMatch = path.match(/^\/api\/rooms\/([a-z0-9]+)\/close$/i);
    if (closeMatch && (request.method === 'POST' || request.method === 'DELETE')) {
      const { fresh } = await this.all();
      delete fresh[closeMatch[1].toLowerCase()];
      await this.ctx.storage.put('rooms', fresh);
      return json({ ok: true });
    }

    const removeMatch = path.match(/^\/api\/rooms\/([a-z0-9]+)$/i);
    if (removeMatch && request.method === 'DELETE') {
      const { fresh } = await this.all();
      delete fresh[removeMatch[1].toLowerCase()];
      await this.ctx.storage.put('rooms', fresh);
      return json({ ok: true });
    }

    if (path === '/health') {
      const { fresh } = await this.all();
      return json({ ok: true, rooms: Object.keys(fresh).length });
    }

    return json({ error: 'not-found' }, 404);
  }
}

/**
 * The backup channel of one room.
 *
 * The host publishes its snapshot and the answers for the guests, the guest
 * reads the snapshot and sends its actions.
 */
export class Room {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async entry() {
    return (
      (await this.ctx.storage.get('relay')) ?? {
        views: {},
        welcome: {},
        voice: {},
        errors: {},
        actions: [],
        updatedAt: 0,
      }
    );
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const match = path.match(/^\/api\/relay\/([a-z0-9]+)(?:\/(host|guest|close))?$/i);
    if (!match) return json({ error: 'not-found' }, 404);

    const role = match[2]?.toLowerCase();

    if (role === 'close') {
      await this.ctx.storage.delete('relay');
      return json({ ok: true });
    }

    if (request.method === 'GET') {
      const entry = await this.entry();
      if (role === 'host') {
        const actions = entry.actions.splice(0, entry.actions.length);
        await this.ctx.storage.put('relay', entry);
        return json({ actions });
      }
      return json({
        views: entry.views ?? {},
        welcome: entry.welcome ?? {},
        voice: entry.voice ?? {},
        errors: entry.errors ?? {},
        updatedAt: entry.updatedAt ?? 0,
      });
    }

    if (request.method === 'POST') {
      const raw = await request.text();
      if (raw.length > MAX_SNAPSHOT_BYTES) return json({ error: 'too-large' }, 413);
      const payload = (() => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })();
      if (!payload || typeof payload !== 'object') return json({ error: 'bad-json' }, 400);

      const entry = await this.entry();
      entry.updatedAt = Date.now();
      if (role === 'host') {
        // A personal view for every guest — the roles stay secret.
        entry.views = payload.views ?? {};
        entry.welcome = payload.welcome ?? {};
        entry.voice = payload.voice ?? {};
        entry.errors = payload.errors ?? {};
        // Publishing and collecting in one request keeps the quota small.
        const actions = entry.actions.splice(0, entry.actions.length);
        await this.ctx.storage.put('relay', entry);
        return json({ ok: true, actions });
      } else if (payload.id) {
        entry.actions.push({
          id: String(payload.id).slice(0, 80),
          key: String(payload.key ?? '').slice(0, 40),
          payload: payload.payload ?? null,
        });
        if (entry.actions.length > MAX_ACTIONS) {
          entry.actions.splice(0, entry.actions.length - MAX_ACTIONS);
        }
      }
      await this.ctx.storage.put('relay', entry);
      // The guest reads the state of the host in the same request.
      return json({
        ok: true,
        views: entry.views ?? {},
        welcome: entry.welcome ?? {},
        voice: entry.voice ?? {},
        errors: entry.errors ?? {},
        updatedAt: entry.updatedAt ?? 0,
      });
    }

    return json({ error: 'method' }, 405);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // The backup channel of a room — every room has its own object.
    const relayMatch = path.match(/^\/api\/relay\/([a-z0-9]+)(?:\/(host|guest|close))?$/i);
    if (relayMatch) {
      const id = env.ROOMS.idFromName(`room:${relayMatch[1].toLowerCase()}`);
      return env.ROOMS.get(id).fetch(request);
    }

    // The catalog of the open rooms and the health check.
    const id = env.CATALOG.idFromName('catalog');
    return env.CATALOG.get(id).fetch(request);
  },
};
