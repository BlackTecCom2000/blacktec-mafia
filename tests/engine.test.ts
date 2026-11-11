import { describe, expect, it } from 'vitest';
import { MafiaEngine, KICK_COOLDOWN_SECONDS } from '../src/game/engine';
import { hasManiac, mafiaCount, roleDeck } from '../src/game/roles';
import { buildView } from '../src/game/view';
import {
  DEFAULT_CONFIG,
  type Action,
  type GameState,
  type PlayerState,
  type Role,
  type RoleComposition,
} from '../src/game/types';
import { createRng } from '../src/game/rng';
import { chooseVote } from '../src/game/bots';

const T0 = 1_000_000;

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

/** Overwrites dealt roles, keeping seats stable. */
function assignRoles(engine: MafiaEngine, roles: Role[]): void {
  engine.state.players.forEach((player, index) => {
    player.role = roles[index] ?? 'citizen';
  });
}

function resetNight(engine: MafiaEngine): void {
  engine.state.night = {
    mafiaVotes: {},
    doctorTargets: {},
    detectiveTargets: {},
    sheriffTargets: {},
    maniacTargets: {},
    locked: false,
    lockedAt: null,
  };
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

/** Lets every living player abstain so the vote resolves. */
function abstainAll(engine: MafiaEngine): void {
  for (const player of engine.state.players) {
    if (!player.alive) continue;
    engine.submit(player.id, { type: 'vote', targetId: null }, T0);
  }
}

function customEngine(composition: RoleComposition, players: number, seed = 7): MafiaEngine {
  const engine = new MafiaEngine({
    hostId: 'host',
    seed,
    settings: { custom: true, roleSet: 'custom', composition, maxPlayers: Math.max(players, 12) },
  });
  engine.addPlayer('host', 'Хост');
  engine.fillBots(players);
  return engine;
}

describe('role composition', () => {
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

  it('clamps out-of-range table sizes', () => {
    expect(roleDeck(3)).toHaveLength(6);
    expect(roleDeck(20)).toHaveLength(12);
  });

  it('keeps the sheriff out of the standard decks', () => {
    for (let count = 6; count <= 12; count += 1) {
      expect(roleDeck(count)).not.toContain('sheriff');
    }
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

  it('deals one role per player and starts at night', () => {
    const engine = setup(9);
    expect(engine.state.players).toHaveLength(9);
    for (const player of engine.state.players) {
      expect(player.alive).toBe(true);
      expect(player.role).toBeTruthy();
    }
    expect(engine.state.players.filter((player) => player.role === 'mafia')).toHaveLength(3);
    expect(engine.state.players.some((player) => player.role === 'maniac')).toBe(true);
    expect(engine.state.phase).toBe('night');
    expect(engine.state.day).toBe(1);
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
    expect(engine.state.players.every((player) => player.lobbyReady)).toBe(true);
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

describe('custom compositions', () => {
  it('supports six maniacs, one sheriff and two citizens', () => {
    const composition: RoleComposition = {
      mafia: 0,
      doctor: 0,
      detective: 0,
      sheriff: 1,
      maniac: 6,
      citizen: 2,
    };
    const engine = customEngine(composition, 9);
    for (const player of engine.state.players) player.lobbyReady = true;
    expect(engine.startMatch('host', T0).ok).toBe(true);
    const roles = engine.state.players.map((player) => player.role);
    expect(roles.filter((role) => role === 'maniac')).toHaveLength(6);
    expect(roles.filter((role) => role === 'sheriff')).toHaveLength(1);
    expect(roles.filter((role) => role === 'citizen')).toHaveLength(2);
  });

  it('refuses to start when the players do not match the composition', () => {
    const composition: RoleComposition = {
      mafia: 2,
      doctor: 1,
      detective: 1,
      sheriff: 0,
      maniac: 0,
      citizen: 3,
    };
    const engine = customEngine(composition, 6);
    for (const player of engine.state.players) player.lobbyReady = true;
    expect(engine.startMatch('host', T0)).toEqual({ ok: false, error: 'err.composition' });
  });

  it('allows an incomplete composition when the room allows it', () => {
    const composition: RoleComposition = {
      mafia: 2,
      doctor: 1,
      detective: 1,
      sheriff: 1,
      maniac: 1,
      citizen: 3,
    };
    const engine = customEngine(composition, 5);
    engine.state.settings.allowIncomplete = true;
    for (const player of engine.state.players) player.lobbyReady = true;
    expect(engine.startMatch('host', T0).ok).toBe(true);
  });

  it('rejects compositions without a city side', () => {
    const engine = customEngine({ mafia: 0, doctor: 0, detective: 0, sheriff: 0, maniac: 6, citizen: 0 }, 6);
    const result = engine.submit('host', {
      type: 'setComposition',
      composition: { mafia: 0, doctor: 0, detective: 0, sheriff: 0, maniac: 6, citizen: 0 },
    }, T0);
    expect(result).toEqual({ ok: false, error: 'err.composition' });
  });

  it('never stores a negative number of roles', () => {
    const engine = customEngine({ mafia: 1, doctor: 1, detective: 1, sheriff: 0, maniac: 0, citizen: 1 }, 5);
    engine.submit('host', {
      type: 'setComposition',
      composition: { mafia: -3, doctor: 1, detective: 1, sheriff: 0, maniac: 0, citizen: 1 },
    }, T0);
    expect(engine.state.settings.composition.mafia).toBe(0);
  });

  it('restores the standard roles on request', () => {
    const engine = customEngine({ mafia: 1, doctor: 1, detective: 1, sheriff: 0, maniac: 0, citizen: 1 }, 5);
    engine.submit('host', { type: 'resetComposition' }, T0);
    expect(engine.state.settings.roleSet).toBe('standard');
    expect(engine.state.settings.composition.mafia).toBe(2);
  });

  it('keeps more than twelve seats in a custom room', () => {
    const engine = customEngine({ mafia: 4, doctor: 2, detective: 2, sheriff: 2, maniac: 2, citizen: 6 }, 18);
    expect(engine.state.players).toHaveLength(18);
  });
});

describe('night resolution', () => {
  function nightTable(roles: Role[]): MafiaEngine {
    const engine = setup(roles.length);
    assignRoles(engine, roles);
    resetNight(engine);
    expect(engine.state.phase).toBe('night');
    return engine;
  }

  it('kills the mafia target and reveals the role of the dead', () => {
    const engine = nightTable([
      'citizen',
      'mafia',
      'citizen',
      'citizen',
      'citizen',
      'citizen',
      'citizen',
      'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const victim = engine.state.players[2]!;
    expect(engine.submit(mafia.id, { type: 'kill', targetId: victim.id }, T0).ok).toBe(true);
    tickTo(engine, T0 + 4000);

    expect(engine.state.phase).toBe('dawn');
    expect(victim.alive).toBe(false);
    expect(engine.state.lastNight?.deaths.map((death) => death.id)).toContain(victim.id);

    const killedLog = engine.state.log.find((entry) => entry.code === 'log.killed');
    expect(killedLog?.params?.role).toBe('citizen');

    const view = buildView(engine.state, 'p1', T0 + 3000);
    const seen = view.players.find((player) => player.id === victim.id);
    expect(seen?.roleVisible).toBe(true);
    expect(seen?.role).toBe('citizen');
    expect(seen?.alive).toBe(false);
    const victimView = buildView(engine.state, victim.id, T0 + 3000);
    expect(victimView.players.find((player) => player.id === victim.id)?.role).toBe('citizen');
  });

  it('doctor prevents the kill', () => {
    const engine = nightTable([
      'citizen',
      'mafia',
      'citizen',
      'doctor',
      'citizen',
      'citizen',
      'citizen',
      'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const doctor = roleOf(engine, 'doctor');
    const victim = engine.state.players[0]!;
    engine.submit(mafia.id, { type: 'kill', targetId: victim.id }, T0);
    engine.submit(doctor.id, { type: 'heal', targetId: victim.id }, T0);
    tickTo(engine, T0 + 4000);

    expect(victim.alive).toBe(true);
    expect(engine.state.lastNight?.saved).toBe(true);
    expect(engine.state.lastNight?.deaths).toHaveLength(0);
  });

  it('lets the doctor save himself', () => {
    const engine = nightTable([
      'citizen',
      'mafia',
      'citizen',
      'doctor',
      'citizen',
      'citizen',
      'citizen',
      'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const doctor = roleOf(engine, 'doctor');
    engine.submit(mafia.id, { type: 'kill', targetId: doctor.id }, T0);
    expect(engine.submit(doctor.id, { type: 'heal', targetId: doctor.id }, T0).ok).toBe(true);
    tickTo(engine, T0 + 4000);
    expect(doctor.alive).toBe(true);
  });

  it('detective learns whether a target is mafia, privately', () => {
    const engine = nightTable([
      'citizen',
      'mafia',
      'citizen',
      'citizen',
      'detective',
      'citizen',
      'citizen',
      'citizen',
    ]);
    const detective = roleOf(engine, 'detective');
    const mafia = roleOf(engine, 'mafia');
    const clean = engine.state.players[2]!;
    engine.submit(mafia.id, { type: 'kill', targetId: clean.id }, T0);
    engine.submit(detective.id, { type: 'investigate', targetId: mafia.id }, T0);
    tickTo(engine, T0 + 4000);

    expect(detective.checks[mafia.id]).toBe('mafia');
    const detectiveView = buildView(engine.state, detective.id, T0 + 3000);
    expect(detectiveView.myChecks).toEqual([{ id: mafia.id, result: 'mafia' }]);

    const outsiderView = buildView(engine.state, clean.id, T0 + 3000);
    expect(outsiderView.myChecks).toHaveLength(0);
    const privateLogs = outsiderView.log.filter((entry) => entry.code.startsWith('log.check.'));
    expect(privateLogs).toHaveLength(0);
  });

  it('sheriff also detects the maniac', () => {
    const engine = nightTable([
      'citizen',
      'mafia',
      'citizen',
      'citizen',
      'sheriff',
      'maniac',
      'citizen',
      'citizen',
    ]);
    const sheriff = roleOf(engine, 'sheriff');
    const mafia = roleOf(engine, 'mafia');
    const maniac = roleOf(engine, 'maniac');
    engine.submit(mafia.id, { type: 'kill', targetId: engine.state.players[2]!.id }, T0);
    expect(engine.submit(sheriff.id, { type: 'sheriffCheck', targetId: maniac.id }, T0).ok).toBe(true);
    // The choice can still be corrected inside the grace window.
    expect(engine.submit(sheriff.id, { type: 'sheriffCheck', targetId: mafia.id }, T0 + 500).ok).toBe(true);
    engine.submit(maniac.id, { type: 'maniacKill', targetId: engine.state.players[3]!.id }, T0);
    tickTo(engine, T0 + 4000);
    expect(sheriff.checks[mafia.id]).toBe('mafia');
    expect(sheriff.checks[maniac.id]).toBeUndefined();
  });

  it('rejects illegal night actions', () => {
    const engine = nightTable([
      'citizen',
      'mafia',
      'mafia',
      'doctor',
      'detective',
      'maniac',
      'citizen',
      'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const otherMafia = engine.state.players.find(
      (player) => player.role === 'mafia' && player.id !== mafia.id,
    )!;
    expect(engine.submit(mafia.id, { type: 'kill', targetId: mafia.id }, T0).ok).toBe(false);
    expect(engine.submit(mafia.id, { type: 'kill', targetId: otherMafia.id }, T0).ok).toBe(false);
    expect(engine.submit(engine.state.players[0]!.id, { type: 'kill', targetId: mafia.id }, T0).ok).toBe(
      false,
    );
  });

  it('locks the night only when every role has chosen', () => {
    const engine = nightTable([
      'citizen',
      'mafia',
      'citizen',
      'citizen',
      'detective',
      'citizen',
      'citizen',
      'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const detective = roleOf(engine, 'detective');
    engine.submit(mafia.id, { type: 'kill', targetId: engine.state.players[2]!.id }, T0);
    expect(engine.state.night.locked).toBe(false);
    engine.submit(detective.id, { type: 'investigate', targetId: mafia.id }, T0);
    expect(engine.state.night.locked).toBe(true);
  });

  it('keeps a correction window after the night was locked', () => {
    const engine = nightTable([
      'citizen',
      'mafia',
      'citizen',
      'citizen',
      'citizen',
      'citizen',
      'citizen',
      'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    engine.submit(mafia.id, { type: 'kill', targetId: engine.state.players[2]!.id }, T0);
    expect(engine.state.night.locked).toBe(true);
    tickTo(engine, T0 + 1000);
    expect(engine.state.phase).toBe('night');
    // The choice can still be corrected inside the window.
    expect(engine.submit(mafia.id, { type: 'kill', targetId: engine.state.players[3]!.id }, T0 + 1200).ok).toBe(true);
    tickTo(engine, T0 + 4000);
    expect(engine.state.phase).toBe('dawn');
    expect(engine.state.players[3]!.alive).toBe(false);
    expect(engine.state.players[2]!.alive).toBe(true);
  });

  it('kills the victim of every maniac', () => {
    const engine = nightTable([
      'citizen',
      'mafia',
      'citizen',
      'citizen',
      'citizen',
      'maniac',
      'maniac',
      'citizen',
    ]);
    const mafia = roleOf(engine, 'mafia');
    const maniacs = engine.state.players.filter((player) => player.role === 'maniac');
    engine.submit(mafia.id, { type: 'kill', targetId: engine.state.players[2]!.id }, T0);
    engine.submit(maniacs[0]!.id, { type: 'maniacKill', targetId: engine.state.players[3]!.id }, T0);
    engine.submit(maniacs[1]!.id, { type: 'maniacKill', targetId: engine.state.players[4]!.id }, T0);
    tickTo(engine, T0 + 4000);
    expect(engine.state.lastNight?.deaths).toHaveLength(3);
  });

  it('kills nobody when the mafia cannot agree', () => {
    const engine = nightTable([
      'citizen',
      'mafia',
      'citizen',
      'citizen',
      'mafia',
      'citizen',
      'citizen',
      'citizen',
    ]);
    const mafia = engine.state.players.filter((player) => player.role === 'mafia');
    engine.submit(mafia[0]!.id, { type: 'kill', targetId: engine.state.players[2]!.id }, T0);
    engine.submit(mafia[1]!.id, { type: 'kill', targetId: engine.state.players[3]!.id }, T0);
    tickTo(engine, T0 + 4000);
    expect(engine.state.lastNight?.deaths).toHaveLength(0);
    expect(engine.state.log.some((entry) => entry.code === 'log.mafiaSplit')).toBe(true);
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
      if (player.id === target.id) {
        engine.submit(player.id, { type: 'vote', targetId: null }, T0);
      } else {
        engine.submit(player.id, { type: 'vote', targetId: target.id }, T0);
      }
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

  it('counts abstentions separately and does not exclude on them', () => {
    const engine = setup(6);
    enterVoting(engine);
    const players = engine.state.players;
    const target = players[1]!;
    for (const player of players) {
      const vote = player.id === target.id ? null : target.id;
      engine.submit(player.id, { type: 'vote', targetId: vote }, T0);
    }
    tickTo(engine, T0 + 2500);
    // 5 votes for the target, the target itself abstained.
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
      if (player.id === target.id) {
        engine.submit(player.id, { type: 'vote', targetId: null }, T0);
      } else {
        engine.submit(player.id, { type: 'vote', targetId: target.id }, T0);
      }
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
    // Only the maniac and one citizen are left.
    for (const player of engine.state.players) player.alive = false;
    engine.state.players[2]!.alive = true;
    engine.state.players[0]!.alive = true;
    enterVoting(engine);    abstainAll(engine);    tickTo(engine, T0 + 2500);
    expect(engine.state.winner).toBeNull();
  });

  it('the maniac wins as the last one standing', () => {
    const engine = setup(6, 13);
    assignRoles(engine, ['citizen', 'mafia', 'maniac', 'citizen', 'citizen', 'citizen']);
    for (const player of engine.state.players) player.alive = false;
    engine.state.players[2]!.alive = true;
    enterVoting(engine);    abstainAll(engine);    tickTo(engine, T0 + 2500);
    expect(engine.state.winner).toBe('maniac');
  });

  it('lets the maniac faction win when every survivor is a maniac', () => {
    const engine = setup(6, 17);
    engine.state.settings.maniacWinRule = 'faction';
    assignRoles(engine, ['citizen', 'mafia', 'maniac', 'maniac', 'citizen', 'citizen']);
    for (const player of engine.state.players) player.alive = false;
    engine.state.players[2]!.alive = true;
    engine.state.players[3]!.alive = true;
    enterVoting(engine);    abstainAll(engine);    tickTo(engine, T0 + 2500);
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
    enterVoting(engine);    abstainAll(engine);    tickTo(engine, T0 + 2500);
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

  it('removes a guest who leaves the lobby', () => {
    const engine = new MafiaEngine({ hostId: 'p1', seed: 1 });
    engine.addPlayer('p1', 'Хост');
    engine.addPlayer('p2', 'Гость');
    engine.removePlayer('p2');
    expect(engine.find('p2')).toBeNull();
    expect(engine.state.players).toHaveLength(1);
  });
});

describe('kick voting', () => {
  function kickTable(): MafiaEngine {
    const engine = new MafiaEngine({ hostId: 'host', seed: 3 });
    engine.addPlayer('host', 'Хост');
    engine.addPlayer('g1', 'Гость');
    engine.addPlayer('g2', 'Гость');
    engine.addPlayer('g3', 'Гость');
    engine.addPlayer('g4', 'Гость');
    return engine;
  }

  it('needs a quorum of yes votes and more yes than no', () => {
    const engine = kickTable();
    const target = engine.find('g4')!;

    expect(engine.submit('g1', { type: 'kickStart', targetId: target.id }, T0).ok).toBe(true);
    expect(engine.state.kickVote).not.toBeNull();
    expect(engine.state.kickVote?.quorum).toBe(2);
    expect(engine.state.kickVote?.eligible).toBe(4);

    engine.submit('g1', { type: 'kickVote', choice: 'yes' }, T0);
    engine.submit('g2', { type: 'kickVote', choice: 'no' }, T0);
    expect(engine.state.kickVote).not.toBeNull();

    engine.submit('g3', { type: 'kickVote', choice: 'yes' }, T0);
    expect(engine.state.kickVote).toBeNull();
    expect(engine.find(target.id)).toBeNull();
  });

  it('never counts the target or silence as a yes vote', () => {
    const engine = kickTable();
    engine.submit('g1', { type: 'kickStart', targetId: 'g4' }, T0);
    expect(engine.submit('g4', { type: 'kickVote', choice: 'yes' }, T0)).toEqual({
      ok: false,
      error: 'err.self',
    });
    engine.submit('g1', { type: 'kickVote', choice: 'yes' }, T0);
    // Only one yes vote — the quorum of two is not reached.
    expect(engine.state.kickVote).not.toBeNull();
  });

  it('does not let one player start votes without limits', () => {
    const engine = kickTable();
    engine.submit('g1', { type: 'kickStart', targetId: 'g4' }, T0);
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
    const engine = kickTable();
    engine.submit('g1', { type: 'kickStart', targetId: 'g4' }, T0);
    engine.tick(T0 + 40_000);
    expect(engine.state.kickVote).toBeNull();
    expect(engine.state.log.some((entry) => entry.code === 'log.kickFailed')).toBe(true);
    expect(engine.find('g4')).not.toBeNull();
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
    // The seat stays in the match, the character is played by a bot.
    expect(engine.state.players).toHaveLength(8);
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
      'mafia',
      'mafia',
      'citizen',
      'doctor',
      'detective',
      'maniac',
      'citizen',
      'citizen',
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
  it('prefers a known mafia when voting as the detective', () => {
    const engine = setup(8);
    assignRoles(engine, [
      'detective',
      'mafia',
      'mafia',
      'doctor',
      'citizen',
      'maniac',
      'citizen',
      'citizen',
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
      'mafia',
      'mafia',
      'citizen',
      'doctor',
      'detective',
      'maniac',
      'citizen',
      'citizen',
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
});

describe('action validation', () => {
  it('rejects unknown actions', () => {
    const engine = setup(6);
    const result = engine.submit('p1', { type: 'nonsense' } as unknown as Action, T0);
    expect(result).toEqual({ ok: false, error: 'err.unknown' });
  });
});
