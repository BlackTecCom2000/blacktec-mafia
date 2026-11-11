import { describe, expect, it } from 'vitest';
import { MafiaEngine, KICK_COOLDOWN_SECONDS } from '../src/game/engine';
import {
  balanceWarnings,
  compositionTotal,
  emptyComposition,
  hasManiac,
  mafiaCount,
  roleDeck,
  ROLE_INFO,
} from '../src/game/roles';
import { buildView } from '../src/game/view';
import {
  DEFAULT_CONFIG,
  type GameState,
  type NightChoiceKind,
  type PlayerState,
  type Role,
  type RoleComposition,
} from '../src/game/types';
import { createRng } from '../src/game/rng';
import { botNightChoice, chooseVote } from '../src/game/bots';

const T0 = 1_000_000;

/** Builds a composition, missing roles are zero. */
function composition(roles: Partial<RoleComposition>): RoleComposition {
  return { ...emptyComposition(), ...roles };
}

function setup(count = 8, seed = 42): MafiaEngine {
  const engine = new MafiaEngine({
    hostId: 'p1',
    seed,
    config: { nightSeconds: 24, discussionSeconds: 60, votingSeconds: 35, revealSeconds: 6 },
  });
  engine.addPlayer('p1', 'Игрок');
  engine.fillBots(count);
  for (const player of engine.state.players) player.lobbyReady = true;
  const res = engine.startMatch('p1', T0);
  expect(res.ok).toBe(true);
  return engine;
}

/** A custom room with the given composition and the given number of players. */
function customRoom(
  roles: Partial<RoleComposition>,
  players: number,
  seed = 7,
): MafiaEngine {
  const engine = new MafiaEngine({
    hostId: 'host',
    seed,
    settings: {
      custom: true,
      roleSet: 'custom',
      composition: composition(roles),
      maxPlayers: Math.max(12, compositionTotal(composition(roles))),
    },
  });
  engine.addPlayer('host', 'Хост');
  engine.fillBots(players);
  for (const player of engine.state.players) player.lobbyReady = true;
  return engine;
}

/** Overwrites dealt roles, keeping seats stable. */
function assignRoles(engine: MafiaEngine, roles: Role[]): void {
  engine.state.players.forEach((player, index) => {
    player.role = roles[index] ?? 'citizen';
  });
}

function clearNight(engine: MafiaEngine): void {
  for (const kind of Object.keys(engine.state.night.choices) as NightChoiceKind[]) {
    engine.state.night.choices[kind] = {};
  }
  engine.state.night.locked = false;
  engine.state.night.lockedAt = null;
}

function roleOf(engine: MafiaEngine, role: Role): PlayerState {
  const player = engine.state.players.find((item) => item.role === role);
  if (!player) throw new Error(`no ${role} at the table`);
  return player;
}

function tickTo(engine: MafiaEngine, now: number): void {
  engine.tick(now);
}

function enterVoting(engine: MafiaEngine): void {
  const state = engine.state;
  state.phase = 'voting';
  state.phaseStartedAt = T0;
  state.phaseEndsAt = T0 + 35_000;
  for (const player of state.players) {
    player.hasVoted = false;
    player.votedFor = null;
  }
  state.version += 1;
}

function act(
  engine: MafiaEngine,
  playerId: string,
  kind: NightChoiceKind,
  targetId: string,
): void {
  const result = engine.submit(playerId, { type: 'night', kind, targetId }, T0);
  expect(result.ok, `${kind} by ${playerId}`).toBe(true);
}

describe('role registry', () => {
  it('describes every role with a faction and a night action', () => {
    for (const [role, info] of Object.entries(ROLE_INFO)) {
      expect(info.faction).toBeTruthy();
      expect(typeof info.base).toBe('boolean');
      expect(info.visibility).toBeTruthy();
      expect(role).toBeTruthy();
    }
  });

  it('keeps the standard decks free of the optional roles', () => {
    for (let count = 6; count <= 12; count += 1) {
      for (const role of roleDeck(count)) {
        expect(ROLE_INFO[role].base, role).toBe(true);
      }
    }
  });

  it('deals a full table for every supported size', () => {
    for (let count = 6; count <= 12; count += 1) {
      const deck = roleDeck(count);
      expect(deck).toHaveLength(count);
      expect(deck.filter((role) => role === 'mafia').length).toBe(mafiaCount(count));
      expect(deck.includes('maniac')).toBe(hasManiac(count));
      expect(deck.includes('doctor')).toBe(true);
      expect(deck.includes('detective')).toBe(true);
    }
  });

  it('warns about an unbalanced composition but does not block it', () => {
    const balanced = composition({ mafia: 2, doctor: 1, detective: 1, citizen: 3 });
    expect(balanceWarnings(balanced)).toHaveLength(0);
    const unbalanced = composition({ mafia: 6, doctor: 1, citizen: 2 });
    expect(balanceWarnings(unbalanced).length).toBeGreaterThan(0);
  });
});

describe('custom compositions', () => {
  it('supports six maniacs, one sheriff and two citizens', () => {
    const engine = customRoom({ maniac: 6, sheriff: 1, citizen: 2 }, 9);
    expect(engine.startMatch('host', T0).ok).toBe(true);
    const roles = engine.state.players.map((player) => player.role);
    expect(roles.filter((role) => role === 'maniac')).toHaveLength(6);
    expect(roles.filter((role) => role === 'sheriff')).toHaveLength(1);
    expect(roles.filter((role) => role === 'citizen')).toHaveLength(2);
  });

  it('refuses to start when the players do not match the composition', () => {
    const engine = customRoom({ mafia: 2, doctor: 1, detective: 1, citizen: 3 }, 6);
    expect(engine.startMatch('host', T0)).toEqual({ ok: false, error: 'err.composition' });
  });

  it('allows an incomplete composition when the room allows it', () => {
    const engine = customRoom({ mafia: 2, doctor: 1, detective: 1, citizen: 3 }, 5);
    engine.state.settings.allowIncomplete = true;
    expect(engine.startMatch('host', T0).ok).toBe(true);
  });

  it('rejects a composition without a city side', () => {
    const engine = customRoom({ mafia: 3, citizen: 0 }, 3);
    const result = engine.submit('host', {
      type: 'setComposition',
      composition: composition({ mafia: 3 }),
    }, T0);
    expect(result).toEqual({ ok: false, error: 'err.composition' });
  });

  it('never stores a negative number of roles', () => {
    const engine = customRoom({ mafia: 1, doctor: 1, citizen: 1 }, 3);
    engine.submit('host', {
      type: 'setComposition',
      composition: composition({ mafia: -3, doctor: 1, citizen: 1 }),
    }, T0);
    expect(engine.state.settings.composition.mafia).toBe(0);
  });

  it('restores the standard roles on request', () => {
    const engine = customRoom({ mafia: 1, doctor: 1, citizen: 1 }, 3);
    engine.submit('host', { type: 'resetComposition' }, T0);
    expect(engine.state.settings.roleSet).toBe('standard');
    expect(compositionTotal(engine.state.settings.composition)).toBe(6);
  });

  it('keeps more than twelve seats in a custom room', () => {
    const engine = customRoom(
      { mafia: 4, doctor: 2, detective: 2, sheriff: 2, maniac: 2, citizen: 6 },
      18,
    );
    expect(engine.state.players).toHaveLength(18);
  });

  it('adds every role of the composition to the deck', () => {
    const engine = customRoom({ mafia: 1, mayor: 1, medium: 1, avenger: 1 }, 4);
    expect(engine.startMatch('host', T0).ok).toBe(true);
    const roles = new Set(engine.state.players.map((player) => player.role));
    expect(roles.has('mayor')).toBe(true);
    expect(roles.has('medium')).toBe(true);
    expect(roles.has('avenger')).toBe(true);
  });
});

describe('lobby rules', () => {
  it('refuses to start with fewer than six players', () => {
    const engine = new MafiaEngine({ hostId: 'p1', seed: 1 });
    engine.addPlayer('p1', 'Игрок');
    engine.fillBots(5);
    expect(engine.startMatch('p1', T0)).toEqual({ ok: false, error: 'err.players' });
    expect(engine.state.phase).toBe('lobby');
  });

  it('only lets the host start the match', () => {
    const engine = new MafiaEngine({ hostId: 'p1', seed: 1 });
    engine.addPlayer('p1', 'Игрок');
    engine.addPlayer('p2', 'Гость');
    engine.fillBots(6);
    for (const player of engine.state.players) {
      if (!player.isBot) player.lobbyReady = true;
    }
    expect(engine.startMatch('p2', T0)).toEqual({ ok: false, error: 'err.host' });
    expect(engine.startMatch('p1', T0).ok).toBe(true);
    expect(engine.state.phase).toBe('night');
  });

  it('needs the readiness of every human player', () => {
    const engine = new MafiaEngine({ hostId: 'p1', seed: 1 });
    engine.addPlayer('p1', 'Игрок');
    engine.addPlayer('p2', 'Гость');
    engine.fillBots(6);
    expect(engine.startMatch('p1', T0)).toEqual({ ok: false, error: 'err.notReady' });
    engine.submit('p1', { type: 'lobbyReady', ready: true }, T0);
    engine.submit('p2', { type: 'lobbyReady', ready: true }, T0);
    expect(engine.startMatch('p1', T0).ok).toBe(true);
  });

  it('resets the readiness when the room settings change', () => {
    const engine = new MafiaEngine({ hostId: 'host', seed: 1 });
    engine.addPlayer('host', 'Хост');
    engine.addPlayer('g1', 'Гость');
    engine.submit('host', { type: 'lobbyReady', ready: true }, T0);
    engine.submit('g1', { type: 'lobbyReady', ready: true }, T0);
    engine.submit('host', { type: 'updateSettings', patch: { nightSeconds: 30 } }, T0);
    expect(engine.state.players.every((player) => !player.isBot && !player.lobbyReady)).toBe(true);
  });

  it('counts bots as ready', () => {
    const engine = new MafiaEngine({ hostId: 'host', seed: 1 });
    engine.addPlayer('host', 'Хост');
    engine.addBot();
    expect(engine.state.players.filter((player) => player.isBot).every((player) => player.lobbyReady)).toBe(true);
  });
});

describe('night actions', () => {
  function nightTable(roles: Role[]): MafiaEngine {
    const engine = setup(roles.length);
    assignRoles(engine, roles);
    clearNight(engine);
    expect(engine.state.phase).toBe('night');
    return engine;
  }

  it('kills the mafia target and reveals the role of the dead', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const victim = engine.state.players[2]!;
    act(engine, mafia.id, 'mafia', victim.id);
    tickTo(engine, T0 + 4000);

    expect(engine.state.phase).toBe('dawn');
    expect(victim.alive).toBe(false);
    expect(engine.state.lastNight?.deaths.map((death) => death.id)).toContain(victim.id);
    const view = buildView(engine.state, 'p1', T0 + 4000);
    const seen = view.players.find((player) => player.id === victim.id);
    expect(seen?.roleVisible).toBe(true);
    expect(seen?.role).toBe('citizen');
  });

  it('protects a player from one kill', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'citizen', 'doctor', 'citizen', 'citizen', 'citizen', 'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const doctor = roleOf(engine, 'doctor');
    const victim = engine.state.players[0]!;
    act(engine, mafia.id, 'mafia', victim.id);
    act(engine, doctor.id, 'heal', victim.id);
    tickTo(engine, T0 + 4000);

    expect(victim.alive).toBe(true);
    expect(engine.state.lastNight?.saved).toBe(true);
    expect(engine.state.lastNight?.deaths).toHaveLength(0);
  });

  it('lets the doctor protect themselves', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'citizen', 'doctor', 'citizen', 'citizen', 'citizen', 'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const doctor = roleOf(engine, 'doctor');
    act(engine, mafia.id, 'mafia', doctor.id);
    act(engine, doctor.id, 'heal', doctor.id);
    tickTo(engine, T0 + 4000);
    expect(doctor.alive).toBe(true);
  });

  it('may forbid protecting the same target two nights in a row', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'citizen', 'doctor', 'citizen', 'citizen', 'citizen', 'citizen',
    ]);
    const doctor = roleOf(engine, 'doctor');
    engine.state.settings.doctorCanRepeatTarget = false;
    act(engine, doctor.id, 'heal', engine.state.players[0]!.id);
    doctor.lastHealTarget = engine.state.players[0]!.id;
    const result = engine.submit(doctor.id, { type: 'night', kind: 'heal', targetId: engine.state.players[0]!.id }, T0);
    expect(result).toEqual({ ok: false, error: 'err.repeat' });
  });

  it('gives the investigator a private answer about the mafia', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'citizen', 'citizen', 'detective', 'citizen', 'citizen', 'citizen',
    ]);
    const detective = roleOf(engine, 'detective');
    const mafia = roleOf(engine, 'mafia');
    const clean = engine.state.players[2]!;
    act(engine, mafia.id, 'mafia', clean.id);
    act(engine, detective.id, 'check', mafia.id);
    tickTo(engine, T0 + 4000);

    expect(detective.checks[mafia.id]).toBe('mafia');
    const view = buildView(engine.state, detective.id, T0 + 4000);
    expect(view.myChecks).toEqual([{ id: mafia.id, result: 'mafia' }]);
    const outsider = buildView(engine.state, clean.id, T0 + 4000);
    expect(outsider.myChecks).toHaveLength(0);
    expect(outsider.log.filter((entry) => entry.code.startsWith('log.check.'))).toHaveLength(0);
  });

  it('lets the sheriff see every hostile faction', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'citizen', 'citizen', 'sheriff', 'maniac', 'citizen', 'citizen',
    ]);
    const sheriff = roleOf(engine, 'sheriff');
    const mafia = roleOf(engine, 'mafia');
    const maniac = roleOf(engine, 'maniac');
    const clean = engine.state.players[0]!;
    act(engine, mafia.id, 'mafia', clean.id);
    act(engine, maniac.id, 'kill', clean.id);
    act(engine, sheriff.id, 'checkAny', mafia.id);
    tickTo(engine, T0 + 4000);
    expect(sheriff.checks[mafia.id]).toBe('mafia');

    const second = nightTable([
      'citizen', 'mafia', 'citizen', 'citizen', 'sheriff', 'maniac', 'citizen', 'citizen',
    ]);
    const sheriff2 = roleOf(second, 'sheriff');
    const maniac2 = roleOf(second, 'maniac');
    act(second, sheriff2.id, 'checkAny', maniac2.id);
    tickTo(second, T0 + 25_000);
    expect(sheriff2.checks[maniac2.id]).toBe('maniac');
  });

  it('rejects illegal night actions', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'mafia', 'doctor', 'detective', 'maniac', 'citizen', 'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const otherMafia = engine.state.players.find(
      (player) => player.role === 'mafia' && player.id !== mafia.id,
    )!;
    expect(engine.submit(mafia.id, { type: 'night', kind: 'mafia', targetId: mafia.id }, T0).ok).toBe(false);
    expect(engine.submit(mafia.id, { type: 'night', kind: 'mafia', targetId: otherMafia.id }, T0).ok).toBe(false);
    expect(engine.submit(engine.state.players[0]!.id, { type: 'night', kind: 'mafia', targetId: mafia.id }, T0).ok).toBe(false);
  });

  it('locks the night only when every role has chosen', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'citizen', 'citizen', 'detective', 'citizen', 'citizen', 'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const detective = roleOf(engine, 'detective');
    act(engine, mafia.id, 'mafia', engine.state.players[2]!.id);
    expect(engine.state.night.locked).toBe(false);
    act(engine, detective.id, 'check', mafia.id);
    expect(engine.state.night.locked).toBe(true);
  });

  it('keeps a correction window after the night was locked', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    act(engine, mafia.id, 'mafia', engine.state.players[2]!.id);
    expect(engine.state.night.locked).toBe(true);
    tickTo(engine, T0 + 1000);
    expect(engine.state.phase).toBe('night');
    act(engine, mafia.id, 'mafia', engine.state.players[3]!.id);
    tickTo(engine, T0 + 4000);
    expect(engine.state.phase).toBe('dawn');
    expect(engine.state.players[3]!.alive).toBe(false);
    expect(engine.state.players[2]!.alive).toBe(true);
  });

  it('lets every maniac act on their own', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'citizen', 'citizen', 'citizen', 'maniac', 'maniac', 'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const maniacs = engine.state.players.filter((player) => player.role === 'maniac');
    act(engine, mafia.id, 'mafia', engine.state.players[2]!.id);
    act(engine, maniacs[0]!.id, 'kill', engine.state.players[3]!.id);
    act(engine, maniacs[1]!.id, 'kill', engine.state.players[4]!.id);
    tickTo(engine, T0 + 4000);
    expect(engine.state.lastNight?.deaths).toHaveLength(3);
  });

  it('kills nobody when the mafia cannot agree', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'citizen', 'citizen', 'mafia', 'citizen', 'citizen', 'citizen',
    ]);
    const mafia = engine.state.players.filter((player) => player.role === 'mafia');
    act(engine, mafia[0]!.id, 'mafia', engine.state.players[2]!.id);
    act(engine, mafia[1]!.id, 'mafia', engine.state.players[3]!.id);
    tickTo(engine, T0 + 4000);
    expect(engine.state.lastNight?.deaths).toHaveLength(0);
    expect(engine.state.log.some((entry) => entry.code === 'log.mafiaSplit')).toBe(true);
  });

  it('lets several doctors protect the same player', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'citizen', 'doctor', 'doctor', 'citizen', 'citizen', 'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const doctors = engine.state.players.filter((player) => player.role === 'doctor');
    const victim = engine.state.players[0]!;
    act(engine, mafia.id, 'mafia', victim.id);
    act(engine, doctors[0]!.id, 'heal', victim.id);
    act(engine, doctors[1]!.id, 'heal', victim.id);
    tickTo(engine, T0 + 4000);
    expect(victim.alive).toBe(true);
  });
});

describe('night resolution order', () => {
  function nightTable(roles: Role[]): MafiaEngine {
    const engine = setup(roles.length);
    assignRoles(engine, roles);
    clearNight(engine);
    return engine;
  }

  it('applies blocking before the other abilities', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'citizen', 'detective', 'blocker', 'citizen', 'citizen', 'citizen',
    ]);
    const blocker = roleOf(engine, 'blocker');
    const detective = roleOf(engine, 'detective');
    const mafia = roleOf(engine, 'mafia');
    // The blocker silences the investigator.
    act(engine, blocker.id, 'block', detective.id);
    act(engine, mafia.id, 'mafia', engine.state.players[0]!.id);
    act(engine, detective.id, 'check', mafia.id);
    tickTo(engine, T0 + 4000);
    expect(detective.checks[mafia.id]).toBeUndefined();
  });

  it('lets the framer make a target look like mafia', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'citizen', 'citizen', 'detective', 'framer', 'citizen', 'citizen',
    ]);
    const framer = roleOf(engine, 'framer');
    const detective = roleOf(engine, 'detective');
    const victim = engine.state.players[0]!;
    act(engine, framer.id, 'frame', victim.id);
    act(engine, detective.id, 'check', victim.id);
    tickTo(engine, T0 + 25_000);
    expect(detective.checks[victim.id]).toBe('mafia');
    // The real role of the target does not change.
    expect(victim.role).toBe('citizen');
    expect(victim.alive).toBe(true);
  });

  it('hides the mafia boss from the investigator when the setting is on', () => {
    const engine = nightTable([
      'citizen', 'mafiaBoss', 'citizen', 'citizen', 'detective', 'citizen', 'citizen', 'citizen',
    ]);
    const boss = roleOf(engine, 'mafiaBoss');
    const detective = roleOf(engine, 'detective');
    engine.state.settings.mafiaBossHides = true;
    act(engine, boss.id, 'mafia', engine.state.players[0]!.id);
    act(engine, detective.id, 'check', boss.id);
    tickTo(engine, T0 + 4000);
    expect(detective.checks[boss.id]).toBe('clean');
  });

  it('shows the mafia boss to the investigator when the setting is off', () => {
    const engine = nightTable([
      'citizen', 'mafiaBoss', 'citizen', 'citizen', 'detective', 'citizen', 'citizen', 'citizen',
    ]);
    const boss = roleOf(engine, 'mafiaBoss');
    const detective = roleOf(engine, 'detective');
    engine.state.settings.mafiaBossHides = false;
    act(engine, boss.id, 'mafia', engine.state.players[0]!.id);
    act(engine, detective.id, 'check', boss.id);
    tickTo(engine, T0 + 4000);
    expect(detective.checks[boss.id]).toBe('mafia');
  });

  it('lets the bodyguard take the hit', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'citizen', 'citizen', 'bodyguard', 'citizen', 'citizen', 'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const guard = roleOf(engine, 'bodyguard');
    const victim = engine.state.players[0]!;
    act(engine, mafia.id, 'mafia', victim.id);
    act(engine, guard.id, 'guard', victim.id);
    tickTo(engine, T0 + 4000);
    expect(victim.alive).toBe(true);
    expect(guard.alive).toBe(false);
    expect(guard.deathCause).toBe('guard');
  });

  it('kills a player when more attacks than protections hit them', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'citizen', 'citizen', 'doctor', 'maniac', 'maniac', 'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const doctor = roleOf(engine, 'doctor');
    const maniacs = engine.state.players.filter((player) => player.role === 'maniac');
    const victim = engine.state.players[0]!;
    act(engine, mafia.id, 'mafia', victim.id);
    act(engine, doctor.id, 'heal', victim.id);
    act(engine, maniacs[0]!.id, 'kill', victim.id);
    act(engine, maniacs[1]!.id, 'kill', victim.id);
    tickTo(engine, T0 + 4000);
    expect(victim.alive).toBe(false);
  });

  it('cancels the investigation result when the investigator dies at night', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'citizen', 'citizen', 'detective', 'maniac', 'citizen', 'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const maniac = roleOf(engine, 'maniac');
    const detective = roleOf(engine, 'detective');
    act(engine, mafia.id, 'mafia', detective.id);
    act(engine, maniac.id, 'kill', engine.state.players[0]!.id);
    act(engine, detective.id, 'check', mafia.id);
    tickTo(engine, T0 + 4000);
    expect(detective.alive).toBe(false);
    expect(detective.checks[mafia.id]).toBeUndefined();
  });

  it('keeps the result when the room does not cancel checks on death', () => {
    const engine = nightTable([
      'citizen', 'mafia', 'citizen', 'citizen', 'detective', 'maniac', 'citizen', 'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const maniac = roleOf(engine, 'maniac');
    const detective = roleOf(engine, 'detective');
    engine.state.settings.nightDeathCancelsCheck = false;
    act(engine, mafia.id, 'mafia', detective.id);
    act(engine, maniac.id, 'kill', engine.state.players[0]!.id);
    act(engine, detective.id, 'check', mafia.id);
    tickTo(engine, T0 + 4000);
    expect(detective.checks[mafia.id]).toBe('mafia');
  });

  it('resolves the night the same way whatever the seat order is', () => {
    const build = (reverse: boolean) => {
      const engine = nightTable([
        'citizen', 'mafia', 'citizen', 'citizen', 'maniac', 'citizen', 'citizen', 'citizen',
      ]);
      const mafia = roleOf(engine, 'mafia');
      const maniac = roleOf(engine, 'maniac');
      const victim = engine.state.players[0]!;
      act(engine, mafia.id, 'mafia', victim.id);
      act(engine, maniac.id, 'kill', victim.id);
      if (reverse) engine.state.players.reverse();
      tickTo(engine, T0 + 4000);
      return engine.state.lastNight?.deaths.map((death) => death.id).sort() ?? [];
    };
    expect(build(true)).toEqual(build(false));
  });
});

describe('limited abilities', () => {
  it('spends the avenger shots and stops at zero', () => {
    const engine = new MafiaEngine({ hostId: 'p1', seed: 11 });
    engine.addPlayer('p1', 'Мститель');
    engine.fillBots(7);
    for (const player of engine.state.players) player.lobbyReady = true;
    engine.startMatch('p1', T0);
    const avenger = engine.state.players[0]!;
    avenger.role = 'avenger';
    expect(avenger.uses.avenger).toBe(2);
    const target = engine.state.players[1]!;
    act(engine, avenger.id, 'shot', target.id);
    expect(avenger.uses.avenger).toBe(1);
    act(engine, avenger.id, 'shot', target.id);
    expect(avenger.uses.avenger).toBe(0);
    expect(engine.submit(avenger.id, { type: 'night', kind: 'shot', targetId: target.id }, T0)).toEqual({
      ok: false,
      error: 'err.uses',
    });
  });

  it('reports a wrong shot of the avenger', () => {
    const engine = new MafiaEngine({ hostId: 'p1', seed: 12 });
    engine.addPlayer('p1', 'Мститель');
    engine.fillBots(7);
    for (const player of engine.state.players) player.lobbyReady = true;
    engine.startMatch('p1', T0);
    const avenger = engine.state.players[0]!;
    avenger.role = 'avenger';
    const victim = engine.state.players[1]!;
    victim.role = 'citizen';
    act(engine, avenger.id, 'shot', victim.id);
    tickTo(engine, T0 + 4000);
    expect(engine.state.log.some((entry) => entry.code === 'log.avengerMiss')).toBe(true);
  });

  it('lets the mayor reveal themselves once', () => {
    const engine = new MafiaEngine({ hostId: 'p1', seed: 13 });
    engine.addPlayer('p1', 'Мэр');
    engine.fillBots(7);
    for (const player of engine.state.players) player.lobbyReady = true;
    engine.startMatch('p1', T0);
    const mayor = engine.state.players[0]!;
    mayor.role = 'mayor';
    engine.state.phase = 'discussion';
    expect(engine.submit(mayor.id, { type: 'mayorReveal' }, T0).ok).toBe(true);
    expect(mayor.revealed).toBe(true);
    expect(engine.submit(mayor.id, { type: 'mayorReveal' }, T0)).toEqual({
      ok: false,
      error: 'err.uses',
    });
  });

  it('counts the revealed mayor twice', () => {
    const engine = setup(6, 14);
    const mayor = engine.state.players[0]!;
    mayor.role = 'mayor';
    mayor.revealed = true;
    const target = engine.state.players[1]!;
    enterVoting(engine);
    for (const player of engine.state.players) {
      if (!player.alive) continue;
      engine.submit(player.id, { type: 'vote', targetId: player.id === mayor.id ? target.id : null }, T0);
    }
    tickTo(engine, T0 + 2500);
    expect(engine.state.lastVote?.counts[target.id]).toBe(2);
  });

  it('answers the medium only once and only about the dead', () => {
    const engine = setup(6, 15);
    const medium = engine.state.players[0]!;
    medium.role = 'medium';
    const dead = engine.state.players[1]!;
    dead.alive = false;
    dead.role = 'mafia';
    const living = engine.state.players[2]!;
    expect(engine.submit(medium.id, { type: 'night', kind: 'question', targetId: living.id }, T0)).toEqual({
      ok: false,
      error: 'err.target',
    });
    expect(engine.submit(medium.id, { type: 'night', kind: 'question', targetId: dead.id }, T0).ok).toBe(true);
    expect(medium.uses.medium).toBe(0);
    tickTo(engine, T0 + 25_000);
    expect(medium.checks[dead.id]).toBe('mafia');
    expect(engine.submit(medium.id, { type: 'night', kind: 'question', targetId: dead.id }, T0)).toEqual({
      ok: false,
      error: 'err.phase',
    });
  });

  it('gives the nurse the healing only after the doctor is dead', () => {
    const engine = setup(6, 16);
    const doctor = engine.state.players[0]!;
    const nurse = engine.state.players[1]!;
    doctor.role = 'doctor';
    nurse.role = 'nurse';
    expect(engine.allowedNightKinds(nurse)).toEqual([]);
    doctor.alive = false;
    expect(engine.allowedNightKinds(nurse)).toEqual(['heal']);
  });
});

describe('voting', () => {
  it('executes the player with the most votes', () => {
    const engine = setup(6);
    assignRoles(engine, ['citizen', 'mafia', 'citizen', 'doctor', 'detective', 'citizen']);
    enterVoting(engine);
    const target = roleOf(engine, 'mafia');
    for (const player of engine.state.players) {
      if (!player.alive) continue;
      engine.submit(player.id, { type: 'vote', targetId: player.id === target.id ? null : target.id }, T0);
    }
    tickTo(engine, T0 + 2500);

    expect(engine.state.phase).toBe('execution');
    expect(target.alive).toBe(false);
    expect(engine.state.lastVote?.executedId).toBe(target.id);
    expect(engine.state.lastVote?.counts[target.id]).toBe(5);
  });

  it('leaves everyone alive on a tie', () => {
    const engine = setup(6);
    enterVoting(engine);
    const players = engine.state.players;
    players.forEach((player) => {
      player.hasVoted = true;
      player.votedFor = null;
    });
    const [a, b] = players;
    players[0]!.votedFor = b!.id;
    players[1]!.votedFor = b!.id;
    players[2]!.votedFor = a!.id;
    players[3]!.votedFor = a!.id;
    tickTo(engine, T0 + 2500);

    expect(engine.state.lastVote?.tie).toBe(true);
    expect(engine.state.lastVote?.executedId).toBeNull();
    expect(players.every((player) => player.alive)).toBe(true);
  });

  it('counts the abstentions separately', () => {
    const engine = setup(6);
    enterVoting(engine);
    const players = engine.state.players;
    const target = players[1]!;
    for (const player of players) {
      engine.submit(player.id, { type: 'vote', targetId: player.id === target.id ? null : target.id }, T0);
    }
    tickTo(engine, T0 + 2500);
    expect(engine.state.lastVote?.executedId).toBe(target.id);
    expect(engine.state.lastVote?.abstains).toBe(1);
  });

  it('rejects votes from the dead and self-votes', () => {
    const engine = setup(6);
    enterVoting(engine);
    const victim = engine.state.players[2]!;
    victim.alive = false;
    expect(engine.submit(victim.id, { type: 'vote', targetId: null }, T0).ok).toBe(false);
    const voter = engine.state.players[0]!;
    expect(engine.submit(voter.id, { type: 'vote', targetId: voter.id }, T0).ok).toBe(false);
    expect(engine.submit(voter.id, { type: 'vote', targetId: null }, T0).ok).toBe(true);
  });

  it('lets the joker win when the town votes them out', () => {
    const engine = setup(6, 17);
    const joker = engine.state.players[0]!;
    joker.role = 'joker';
    enterVoting(engine);
    for (const player of engine.state.players) {
      if (!player.alive) continue;
      engine.submit(player.id, { type: 'vote', targetId: player.id === joker.id ? null : joker.id }, T0);
    }
    tickTo(engine, T0 + 2500);
    expect(engine.state.personalWinners).toContain(joker.id);
    expect(engine.state.winner).toBeNull();
  });

  it('ends the match when the joker victory is configured that way', () => {
    const engine = setup(6, 18);
    engine.state.settings.jokerEndsGame = true;
    const joker = engine.state.players[0]!;
    joker.role = 'joker';
    enterVoting(engine);
    for (const player of engine.state.players) {
      if (!player.alive) continue;
      engine.submit(player.id, { type: 'vote', targetId: player.id === joker.id ? null : joker.id }, T0);
    }
    tickTo(engine, T0 + 2500);
    expect(engine.state.winner).toBe('joker');
  });
});

describe('chat', () => {
  it('keeps dead players out of the common chat', () => {
    const engine = setup(6);
    const dead = engine.state.players[1]!;
    dead.alive = false;
    expect(engine.submit(dead.id, { type: 'chat', text: 'Я всё видел' }, T0)).toEqual({
      ok: false,
      error: 'err.dead',
    });
    expect(engine.state.log.some((entry) => entry.code === 'chat.entry')).toBe(false);
  });

  it('lets the living talk', () => {
    const engine = setup(6);
    const alive = engine.state.players[0]!;
    expect(engine.submit(alive.id, { type: 'chat', text: 'Я не виноват' }, T0).ok).toBe(true);
    expect(engine.state.log.some((entry) => entry.code === 'chat.entry')).toBe(true);
  });
});

describe('phase control', () => {
  it('does not let the host skip a phase without manual control', () => {
    const engine = setup(6);
    expect(engine.state.settings.manualPhases).toBe(false);
    expect(engine.submit('p1', { type: 'advance' }, T0)).toEqual({ ok: false, error: 'err.manual' });
  });

  it('lets the host skip a phase with manual control', () => {
    const engine = new MafiaEngine({ hostId: 'p1', seed: 5 });
    engine.addPlayer('p1', 'Игрок');
    engine.fillBots(7);
    engine.state.settings.manualPhases = true;
    for (const player of engine.state.players) player.lobbyReady = true;
    engine.startMatch('p1', T0);
    expect(engine.submit('p1', { type: 'advance' }, T0).ok).toBe(true);
    expect(engine.state.phase).toBe('dawn');
  });
});

describe('wins and the full loop', () => {
  it('the city wins when the last mafia is voted out and no maniac remains', () => {
    const engine = setup(6, 7);
    assignRoles(engine, ['citizen', 'mafia', 'citizen', 'doctor', 'detective', 'citizen']);
    engine.state.players.forEach((player) => {
      player.checks = {};
    });
    enterVoting(engine);
    const target = roleOf(engine, 'mafia');
    for (const player of engine.state.players) {
      if (!player.alive) continue;
      engine.submit(player.id, { type: 'vote', targetId: player.id === target.id ? null : target.id }, T0);
    }
    tickTo(engine, T0 + 2500);

    expect(engine.state.winner).toBe('city');
    expect(engine.state.winReason).toBe('log.win.city');
    tickTo(engine, T0 + 12_000);
    expect(engine.state.phase).toBe('gameover');
  });

  it('does not end the game with two survivors while the maniac is not alone', () => {
    const engine = setup(6, 11);
    assignRoles(engine, ['citizen', 'mafia', 'maniac', 'citizen', 'citizen', 'citizen']);
    for (const player of engine.state.players) player.alive = false;
    engine.state.players[2]!.alive = true;
    engine.state.players[0]!.alive = true;
    enterVoting(engine);
    for (const player of engine.state.players) {
      if (!player.alive) continue;
      engine.submit(player.id, { type: 'vote', targetId: null }, T0);
    }
    tickTo(engine, T0 + 2500);
    expect(engine.state.winner).toBeNull();
  });

  it('the maniac wins as the last one standing', () => {
    const engine = setup(6, 13);
    assignRoles(engine, ['citizen', 'mafia', 'maniac', 'citizen', 'citizen', 'citizen']);
    for (const player of engine.state.players) player.alive = false;
    engine.state.players[2]!.alive = true;
    enterVoting(engine);
    engine.submit(engine.state.players[2]!.id, { type: 'vote', targetId: null }, T0);
    tickTo(engine, T0 + 2500);
    expect(engine.state.winner).toBe('maniac');
  });

  it('lets the maniac faction win when every survivor is a maniac', () => {
    const engine = setup(6, 17);
    engine.state.settings.maniacWinRule = 'faction';
    assignRoles(engine, ['citizen', 'mafia', 'maniac', 'maniac', 'citizen', 'citizen']);
    for (const player of engine.state.players) player.alive = false;
    engine.state.players[2]!.alive = true;
    engine.state.players[3]!.alive = true;
    enterVoting(engine);
    for (const player of engine.state.players) {
      if (!player.alive) continue;
      engine.submit(player.id, { type: 'vote', targetId: null }, T0);
    }
    tickTo(engine, T0 + 2500);
    expect(engine.state.winner).toBe('maniac');
  });

  it('the mafia wins with several mafia members when they reach parity', () => {
    const engine = setup(8, 19);
    assignRoles(engine, ['mafia', 'mafia', 'mafia', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen']);
    for (const player of engine.state.players) player.alive = false;
    engine.state.players[0]!.alive = true;
    engine.state.players[1]!.alive = true;
    engine.state.players[2]!.alive = true;
    engine.state.players[3]!.alive = true;
    enterVoting(engine);
    for (const player of engine.state.players) {
      if (!player.alive) continue;
      engine.submit(player.id, { type: 'vote', targetId: null }, T0);
    }
    tickTo(engine, T0 + 2500);
    expect(engine.state.winner).toBe('mafia');
  });

  it('runs a whole match without human input and reaches a verdict', () => {
    const engine = new MafiaEngine({
      hostId: 'p1',
      seed: 99,
      config: {
        ...DEFAULT_CONFIG,
        nightSeconds: 1,
        discussionSeconds: 1,
        votingSeconds: 1,
        revealSeconds: 1,
      },
    });
    engine.addPlayer('p1', 'Игрок');
    engine.fillBots(7);
    for (const player of engine.state.players) player.lobbyReady = true;
    engine.startMatch('p1', T0);

    let now = T0;
    for (let step = 0; step < 800 && engine.state.phase !== 'gameover'; step += 1) {
      now += 1000;
      engine.tick(now);
    }

    expect(engine.state.phase).toBe('gameover');
    expect(engine.state.winner).not.toBeNull();
    expect(engine.state.log.some((entry) => entry.code === engine.state.winReason)).toBe(true);
  });

  it('hands a disconnected human over to the bot autopilot', () => {
    const engine = new MafiaEngine({ hostId: 'p1', seed: 3 });
    engine.addPlayer('p1', 'Игрок');
    engine.addPlayer('p2', 'Гость');
    engine.fillBots(6);
    for (const player of engine.state.players) {
      if (!player.isBot) player.lobbyReady = true;
    }
    engine.startMatch('p1', T0);
    engine.markDisconnected('p2');
    const player = engine.find('p2');
    expect(player?.isBot).toBe(true);
    expect(player?.connected).toBe(false);
    expect(engine.state.log.some((entry) => entry.code === 'log.autopilot')).toBe(true);
  });

  it('frees the seat of a guest that leaves the lobby', () => {
    const engine = new MafiaEngine({ hostId: 'p1', seed: 3 });
    engine.addPlayer('p1', 'Игрок');
    engine.addPlayer('p2', 'Гость');
    engine.fillBots(6);
    engine.markDisconnected('p2');
    expect(engine.find('p2')).toBeNull();
    expect(engine.state.players).toHaveLength(5);
  });

  it('lets the bot answer the discussion automatically', () => {
    const engine = new MafiaEngine({ hostId: 'p1', seed: 3 });
    engine.addPlayer('p1', 'Игрок');
    engine.addPlayer('p2', 'Гость');
    engine.fillBots(6);
    for (const player of engine.state.players) {
      if (!player.isBot) player.lobbyReady = true;
    }
    engine.startMatch('p1', T0);
    engine.state.phase = 'discussion';
    engine.state.phaseEndsAt = T0 + 60_000;
    engine.markDisconnected('p2');
    expect(engine.find('p2')?.ready).toBe(true);
    expect(engine.state.log.some((entry) => entry.code === 'log.autoReady')).toBe(true);
  });
});

describe('kick voting', () => {
  it('needs a quorum of yes votes and more yes than no', () => {
    const engine = new MafiaEngine({ hostId: 'host', seed: 3 });
    engine.addPlayer('host', 'Хост');
    engine.addPlayer('g1', 'Гость');
    engine.addPlayer('g2', 'Гость');
    engine.addPlayer('g3', 'Гость');
    engine.addPlayer('g4', 'Гость');
    const target = engine.find('g4')!;

    expect(engine.submit('g1', { type: 'kickStart', targetId: target.id }, T0).ok).toBe(true);
    expect(engine.state.kickVote?.quorum).toBe(2);

    engine.submit('g1', { type: 'kickVote', choice: 'yes' }, T0);
    engine.submit('g2', { type: 'kickVote', choice: 'no' }, T0);
    expect(engine.state.kickVote).not.toBeNull();

    engine.submit('g3', { type: 'kickVote', choice: 'yes' }, T0);
    expect(engine.state.kickVote).toBeNull();
    expect(engine.find(target.id)).toBeNull();
  });

  it('does not let one player start votes without limits', () => {
    const engine = new MafiaEngine({ hostId: 'host', seed: 3 });
    engine.addPlayer('host', 'Хост');
    engine.addPlayer('g1', 'Гость');
    engine.addPlayer('g2', 'Гость');
    engine.addPlayer('g3', 'Гость');
    engine.submit('g1', { type: 'kickStart', targetId: 'g3' }, T0);
    expect(engine.submit('g2', { type: 'kickStart', targetId: 'host' }, T0)).toEqual({
      ok: false,
      error: 'err.voteOpen',
    });
    engine.submit('g1', { type: 'kickVote', choice: 'yes' }, T0);
    engine.submit('g2', { type: 'kickVote', choice: 'yes' }, T0);
    engine.submit('g3', { type: 'kickVote', choice: 'yes' }, T0);
    expect(engine.state.kickVote).toBeNull();
    expect(engine.submit('g1', { type: 'kickStart', targetId: 'host' }, T0 + 1000)).toEqual({
      ok: false,
      error: 'err.cooldown',
    });
    expect(
      engine.submit('g1', { type: 'kickStart', targetId: 'host' }, T0 + (KICK_COOLDOWN_SECONDS + 1) * 1000).ok,
    ).toBe(true);
  });

  it('closes the vote when the time is up', () => {
    const engine = new MafiaEngine({ hostId: 'host', seed: 3 });
    engine.addPlayer('host', 'Хост');
    engine.addPlayer('g1', 'Гость');
    engine.addPlayer('g2', 'Гость');
    engine.addPlayer('g3', 'Гость');
    engine.submit('g1', { type: 'kickStart', targetId: 'g3' }, T0);
    engine.tick(T0 + 40_000);
    expect(engine.state.kickVote).toBeNull();
    expect(engine.state.log.some((entry) => entry.code === 'log.kickFailed')).toBe(true);
    expect(engine.find('g3')).not.toBeNull();
  });

  it('hands the character to a bot when the match already started', () => {
    const engine = new MafiaEngine({ hostId: 'p1', seed: 3 });
    engine.addPlayer('p1', 'Игрок');
    engine.addPlayer('p2', 'Гость');
    engine.addPlayer('p3', 'Гость');
    engine.addPlayer('p4', 'Гость');
    engine.fillBots(8);
    engine.state.phase = 'discussion';
    engine.state.phaseEndsAt = T0 + 60_000;
    const target = engine.find('p4')!;
    engine.submit('p1', { type: 'kickStart', targetId: target.id }, T0);
    engine.submit('p2', { type: 'kickVote', choice: 'yes' }, T0);
    engine.submit('p3', { type: 'kickVote', choice: 'yes' }, T0);
    expect(engine.state.kickVote).toBeNull();
    expect(engine.state.players.length).toBeGreaterThan(6);
    expect(target.isBot).toBe(true);
    expect(target.connected).toBe(false);
  });
});

describe('snapshot filtering', () => {
  it('hides every role except the viewer’s own and the dead', () => {
    const engine = setup(8);
    const state: GameState = engine.state;
    const deadId = state.players[3]!.id;
    state.players[3]!.alive = false;

    const view = buildView(state, 'p1', T0);
    for (const player of view.players) {
      if (player.id === 'p1' || player.id === deadId) {
        expect(player.role).not.toBeNull();
      } else {
        expect(player.role).toBeNull();
        expect(player.roleVisible).toBe(false);
      }
    }
  });

  it('shows mafia teammates to each other at night', () => {
    const engine = setup(8);
    assignRoles(engine, [
      'mafia', 'mafia', 'citizen', 'doctor', 'detective', 'maniac', 'citizen', 'citizen',
    ]);
    const view = buildView(engine.state, 'p1', T0);
    const teammates = view.players.filter((player) => player.isTeammate);
    expect(teammates).toHaveLength(1);
    expect(teammates[0]?.role).toBe('mafia');
    expect(view.mafiaVotes).not.toBeNull();
  });

  it('reveals all roles once the game is over', () => {
    const engine = setup(8);
    engine.state.phase = 'gameover';
    engine.state.winner = 'city';
    const view = buildView(engine.state, 'p1', T0);
    expect(view.players.every((player) => player.role !== null)).toBe(true);
  });

  it('keeps the room settings and the readiness in sync for every client', () => {
    const engine = new MafiaEngine({ hostId: 'host', seed: 2 });
    engine.addPlayer('host', 'Хост');
    engine.addPlayer('g1', 'Гость');
    engine.submit('g1', { type: 'lobbyReady', ready: true }, T0);
    const hostView = buildView(engine.state, 'host', T0);
    const guestView = buildView(engine.state, 'g1', T0);
    expect(hostView.readyCount).toBe(guestView.readyCount);
    expect(hostView.readyNeeded).toBe(guestView.readyNeeded);
    expect(hostView.settings).toEqual(guestView.settings);
    expect(hostView.settings.hasPassword).toBe(false);
  });
});

describe('bots', () => {
  it('prefers a known mafia when voting as the investigator', () => {
    const engine = setup(8);
    assignRoles(engine, [
      'detective', 'mafia', 'mafia', 'doctor', 'citizen', 'maniac', 'citizen', 'citizen',
    ]);
    enterVoting(engine);
    const detective = roleOf(engine, 'detective');
    const knownMafia = roleOf(engine, 'mafia');
    detective.checks = { [knownMafia.id]: 'mafia' };
    const pick = chooseVote(engine.state, createRng(5), detective);
    expect(pick).toBe(knownMafia.id);
  });

  it('never votes for a mafia teammate unless forced', () => {
    const engine = setup(8);
    assignRoles(engine, [
      'mafia', 'mafia', 'citizen', 'doctor', 'detective', 'maniac', 'citizen', 'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const rng = createRng(11);
    for (let i = 0; i < 20; i += 1) {
      const pick = chooseVote(engine.state, rng, mafia);
      if (pick) {
        const target = engine.find(pick);
        expect(target?.role).not.toBe('mafia');
      }
    }
  });

  it('picks a living target for every night ability', () => {
    const engine = setup(8);
    assignRoles(engine, [
      'citizen', 'mafia', 'citizen', 'doctor', 'detective', 'bodyguard', 'avenger', 'blocker',
    ]);
    const rng = createRng(3);
    const kinds: Array<[Role, NightChoiceKind]> = [
      ['mafia', 'mafia'],
      ['doctor', 'heal'],
      ['detective', 'check'],
      ['bodyguard', 'guard'],
      ['avenger', 'shot'],
      ['blocker', 'block'],
    ];
    for (const [role, kind] of kinds) {
      const bot = roleOf(engine, role);
      const choice = botNightChoice(engine.state, rng, bot, [kind]);
      expect(choice.kind).toBe(kind);
      expect(choice.targetId).toBeTruthy();
      const target = engine.find(choice.targetId!);
      expect(target?.alive).toBe(true);
      expect(target?.id).not.toBe(bot.id);
    }
  });

  it('lets the bot medium ask about a dead player', () => {
    const engine = setup(8);
    assignRoles(engine, [
      'citizen', 'mafia', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'medium',
    ]);
    const dead = engine.state.players[0]!;
    dead.alive = false;
    const medium = roleOf(engine, 'medium');
    const choice = botNightChoice(engine.state, createRng(7), medium, ['question']);
    expect(choice.targetId).toBe(dead.id);
  });
});

describe('action validation', () => {
  it('rejects unknown actions', () => {
    const engine = setup(6);
    const result = engine.submit('p1', { type: 'nonsense' } as never, T0);
    expect(result).toEqual({ ok: false, error: 'err.unknown' });
  });
});
