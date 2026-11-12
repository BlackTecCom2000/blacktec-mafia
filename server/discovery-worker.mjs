/**
 * BlackTec Mafia — room service for Cloudflare Workers.
 *
 * Two jobs in one worker:
 *  1) the catalog of open rooms, so players can find a table;
 *  2) the backup channel, so a room stays reachable when the direct peer
 *     connection does not come through (symmetric NAT, mobile networks).
 *
 * The state lives in D1. The free plan of Cloudflare allows 100 000 written
 * rows a day there, while a Durable Object would spend one of its 100 000
 * requests a day on every poll of a room.
 */

/** A room that was not updated for this long is considered gone. */
const STALE_MS = 60_000;
/** How many rooms the catalog keeps. */
const MAX_ROOMS = 500;
/** How many messages of the guests are kept per room. */
const MAX_ACTIONS = 200;
/** The maximum size of a request. */
const MAX_BODY = 128 * 1024;

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

function parse(value, fallback) {
  if (typeof value !== 'string' || value === '') return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function readBody(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** The state of one room of the backup channel. */
async function readRoom(env, code) {
  const row = await env.DB.prepare(
    'SELECT views, welcome, voice, errors, updatedAt FROM rooms WHERE code = ?',
  )
    .bind(code)
    .first();
  if (!row) {
    return { views: {}, welcome: {}, voice: {}, errors: {}, updatedAt: 0 };
  }
  return {
    views: parse(row.views, {}),
    welcome: parse(row.welcome, {}),
    voice: parse(row.voice, {}),
    errors: parse(row.errors, {}),
    updatedAt: row.updatedAt ?? 0,
  };
}

async function writeRoom(env, code, state) {
  await env.DB.prepare(
    `INSERT INTO rooms (code, views, welcome, voice, errors, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET
       views = excluded.views,
       welcome = excluded.welcome,
       voice = excluded.voice,
       errors = excluded.errors,
       updatedAt = excluded.updatedAt`,
  )
    .bind(
      code,
      JSON.stringify(state.views ?? {}),
      JSON.stringify(state.welcome ?? {}),
      JSON.stringify(state.voice ?? {}),
      JSON.stringify(state.errors ?? {}),
      state.updatedAt ?? Date.now(),
    )
    .run();
}

/**
 * The backup channel of a room.
 *
 * The host publishes a personal view for every guest and collects the
 * messages of the guests in one request — the quota of the free plan is
 * small, so every request that can be spared is spared.
 */
async function handleRelay(request, env, code, role) {
  if (role === 'close') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM actions WHERE room = ?').bind(code),
      env.DB.prepare('DELETE FROM rooms WHERE code = ?').bind(code),
    ]);
    return json({ ok: true });
  }

  if (request.method === 'GET') {
    const room = await readRoom(env, code);
    if (role === 'host') {
      const collected = await env.DB.prepare(
        'DELETE FROM actions WHERE room = ? RETURNING id, key, payload',
      )
        .bind(code)
        .all();
      const actions = (collected?.results ?? []).map((row) => ({
        id: String(row.id ?? ''),
        key: String(row.key ?? ''),
        payload: parse(row.payload, null),
      }));
      return json({ actions });
    }
    return json({
      views: room.views,
      welcome: room.welcome,
      voice: room.voice,
      errors: room.errors,
      updatedAt: room.updatedAt,
    });
  }

  if (request.method === 'POST') {
    const payload = await readBody(request);
    if (!payload || typeof payload !== 'object') return json({ error: 'bad-json' }, 400);

    if (role === 'host') {
      const room = await readRoom(env, code);
      const now = Date.now();
      await writeRoom(env, code, {
        views: payload.views ?? {},
        welcome: payload.welcome ?? {},
        voice: payload.voice ?? {},
        errors: payload.errors ?? {},
        updatedAt: now,
      });
      const collected = await env.DB.prepare(
        'DELETE FROM actions WHERE room = ? RETURNING id, key, payload',
      )
        .bind(code)
        .all();
      const actions = (collected?.results ?? []).map((row) => ({
        id: String(row.id ?? ''),
        key: String(row.key ?? ''),
        payload: parse(row.payload, null),
      }));
      return json({ ok: true, actions });
    }

    // The guest sends its message and reads the state in one request.
    if (payload.id) {
      await env.DB.prepare(
        'INSERT INTO actions (id, room, key, payload, createdAt) VALUES (?, ?, ?, ?, ?)',
      )
        .bind(
          String(payload.id).slice(0, 80),
          code,
          String(payload.key ?? '').slice(0, 40),
          JSON.stringify(payload.payload ?? null),
          Date.now(),
        )
        .run();
      await env.DB.prepare(
        `DELETE FROM actions WHERE room = ? AND id NOT IN (
           SELECT id FROM actions WHERE room = ? ORDER BY createdAt DESC LIMIT ?
         )`,
      )
        .bind(code, code, MAX_ACTIONS)
        .run();
    }
    const room = await readRoom(env, code);
    return json({
      ok: true,
      views: room.views,
      welcome: room.welcome,
      voice: room.voice,
      errors: room.errors,
      updatedAt: room.updatedAt,
    });
  }

  return json({ error: 'method' }, 405);
}

/** The catalog of the open rooms. */
async function readCatalog(env) {
  const row = await env.DB.prepare('SELECT payload FROM catalog WHERE id = 1').first();
  return parse(row?.payload, {});
}

async function writeCatalog(env, rooms) {
  await env.DB.prepare(
    `INSERT INTO catalog (id, payload, updatedAt) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updatedAt = excluded.updatedAt`,
  )
    .bind(JSON.stringify(rooms), Date.now())
    .run();
}

async function handleCatalog(request, env, path) {
  if (path === '/health') {
    const rooms = await readCatalog(env);
    return json({ ok: true, rooms: Object.keys(rooms).length });
  }

  if (path === '/api/rooms') {
    if (request.method === 'GET') {
      const stored = await readCatalog(env);
      const now = Date.now();
      const fresh = {};
      for (const [code, room] of Object.entries(stored)) {
        if (now - room.updatedAt > STALE_MS) continue;
        fresh[code] = room;
      }
      return json({ rooms: Object.values(fresh) });
    }
    if (request.method === 'POST') {
      const payload = await readBody(request);
      const room = sanitizeRoom(payload);
      if (!room) return json({ error: 'bad-room' }, 400);
      const stored = await readCatalog(env);
      const now = Date.now();
      const fresh = {};
      for (const [code, item] of Object.entries(stored)) {
        if (now - item.updatedAt > STALE_MS) continue;
        fresh[code] = item;
      }
      if (!fresh[room.code] && Object.keys(fresh).length >= MAX_ROOMS) {
        return json({ error: 'too-many-rooms' }, 503);
      }
      fresh[room.code] = room;
      await writeCatalog(env, fresh);
      return json({ ok: true });
    }
    return json({ error: 'method' }, 405);
  }

  const closeMatch = path.match(/^\/api\/rooms\/([a-z0-9]+)\/close$/i);
  if (closeMatch && (request.method === 'POST' || request.method === 'DELETE')) {
    const stored = await readCatalog(env);
    delete stored[closeMatch[1].toLowerCase()];
    await writeCatalog(env, stored);
    return json({ ok: true });
  }

  const removeMatch = path.match(/^\/api\/rooms\/([a-z0-9]+)$/i);
  if (removeMatch && request.method === 'DELETE') {
    const stored = await readCatalog(env);
    delete stored[removeMatch[1].toLowerCase()];
    await writeCatalog(env, stored);
    return json({ ok: true });
  }

  return json({ error: 'not-found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // The backup channel of a room.
    const relayMatch = path.match(/^\/api\/relay\/([a-z0-9]+)(?:\/(host|guest|close))?$/i);
    if (relayMatch) {
      return handleRelay(request, env, relayMatch[1].toLowerCase(), relayMatch[2]?.toLowerCase());
    }

    // The catalog of the open rooms.
    return handleCatalog(request, env, path);
  },
};
