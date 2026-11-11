import {
  DEFAULT_CONFIG,
  DEFAULT_ROOM_SETTINGS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TECHNICAL_MAX_PLAYERS,
  type Action,
  type ActionOk,
  type BotMemory,
  type GameConfig,
  type GameState,
  type KickVoteChoice,
  type LogEntry,
  type NightReport,
  type PlayerState,
  type Role,
  type RoomSettings,
  type VoteReport,
} from './types';
import {
  compositionToRoles,
  compositionTotal,
  isCompositionSane,
  normalizeComposition,
  roleDeck,
  standardComposition,
  checkResultFor,
} from './roles';
import { createRng, type Rng } from './rng';
import {
  BOT_NAMES,
  botNightChoice,
  chooseChatLine,
  chooseVote,
  suspicionIncrease,
} from './bots';

export interface EngineOptions {
  hostId?: string;
  config?: Partial<GameConfig>;
  settings?: Partial<RoomSettings>;
  seed?: number;
}

export interface AddPlayerOptions {
  isBot?: boolean;
  connected?: boolean;
}

interface LogOptions {
  audience?: 'all' | 'mafia' | 'private' | 'dead';
  toId?: string;
  actorId?: string;
  text?: string;
}

/** Seconds a kick vote stays open. */
export const KICK_VOTE_SECONDS = 30;
/** Seconds before another kick vote may be started. */
export const KICK_COOLDOWN_SECONDS = 45;

export class MafiaEngine {
  readonly state: GameState;

  private readonly rng: Rng;

  constructor(options: EngineOptions = {}) {
    const config: GameConfig = {
      ...DEFAULT_CONFIG,
      ...options.config,
      seed: options.seed ?? options.config?.seed ?? Date.now(),
    };
    const settings: RoomSettings = {
      ...DEFAULT_ROOM_SETTINGS,
      ...options.settings,
      composition: normalizeComposition({
        ...DEFAULT_ROOM_SETTINGS.composition,
        ...options.settings?.composition,
      }),
    };
    this.rng = createRng(config.seed);
    this.state = {
      version: 1,
      phase: 'lobby',
      day: 0,
      phaseStartedAt: 0,
      phaseEndsAt: 0,
      players: [],
      config,
      settings,
      night: emptyNight(),
      log: [],
      winner: null,
      winReason: null,
      hostId: options.hostId ?? 'host',
      startedAt: 0,
      lastNight: null,
      lastVote: null,
      botMemory: {},
      nextLogId: 1,
      kickVote: null,
      lastKickVoteAt: 0,
      nextKickVoteId: 1,
    };
    this.state.config.nightSeconds = settings.nightSeconds;
    this.state.config.discussionSeconds = settings.discussionSeconds;
    this.state.config.votingSeconds = settings.votingSeconds;
    this.state.config.revealSeconds = settings.revealSeconds;
  }

  // ---------------------------------------------------------------- lobby

  addPlayer(id: string, name: string, options: AddPlayerOptions = {}): PlayerState | null {
    if (this.state.phase !== 'lobby') return null;
    if (this.state.players.some((player) => player.id === id)) return null;
    const limit = Math.min(this.state.settings.maxPlayers, TECHNICAL_MAX_PLAYERS);
    if (this.state.players.length >= limit) return null;

    const cleanName = name.trim().slice(0, 18) || 'Player';
    const isBot = options.isBot ?? false;
    const player: PlayerState = {
      id,
      name: cleanName,
      seat: this.state.players.length,
      role: 'citizen',
      alive: true,
      isBot,
      connected: options.connected ?? true,
      hasVoted: false,
      votedFor: null,
      ready: false,
      lobbyReady: isBot,
      deathDay: null,
      deathCause: null,
      checks: {},
    };
    this.state.players.push(player);
    this.state.botMemory[id] = emptyMemory();
    this.pushLog('log.joined', { name: cleanName, seat: player.seat + 1 });
    this.state.version += 1;
    return player;
  }

  addBot(): PlayerState | null {
    if (this.state.phase !== 'lobby') return null;
    const limit = Math.min(this.state.settings.maxPlayers, TECHNICAL_MAX_PLAYERS);
    if (this.state.players.length >= limit) return null;
    const used = new Set(this.state.players.map((player) => player.name));
    const base = BOT_NAMES.find((name) => !used.has(name)) ?? `Бот ${this.state.players.length + 1}`;
    let name = base;
    let suffix = 2;
    while (used.has(name)) {
      name = `${base} ${suffix}`;
      suffix += 1;
    }
    const usedIds = new Set(this.state.players.map((player) => player.id));
    let index = 1;
    while (usedIds.has(`bot_${index}`)) index += 1;
    return this.addPlayer(`bot_${index}`, name, { isBot: true, connected: true });
  }

  fillBots(target: number): void {
    const limit = Math.min(this.state.settings.maxPlayers, TECHNICAL_MAX_PLAYERS);
    const wanted = Math.max(0, Math.min(limit, Math.round(target)));
    let guard = 0;
    while (this.state.players.length < wanted && guard < TECHNICAL_MAX_PLAYERS) {
      if (!this.addBot()) break;
      guard += 1;
    }
    this.state.version += 1;
  }

  removePlayer(id: string): boolean {
    const index = this.state.players.findIndex((player) => player.id === id);
    if (index < 0) return false;
    const [removed] = this.state.players.splice(index, 1);
    if (!removed) return false;
    delete this.state.botMemory[id];
    this.state.players.forEach((player, seat) => {
      player.seat = seat;
    });
    this.state.version += 1;
    if (this.state.phase === 'lobby') {
      this.pushLog('log.left', { name: removed.name });
      if (this.state.hostId === id) {
        const next = this.state.players.find((player) => !player.isBot);
        if (next) this.state.hostId = next.id;
      }
    }
    return true;
  }

  removeLastBot(): boolean {
    const bot = [...this.state.players].reverse().find((player) => player.isBot);
    if (!bot) return false;
    return this.removePlayer(bot.id);
  }

  setName(id: string, name: string): void {
    const player = this.find(id);
    if (!player) return;
    const clean = name.trim().slice(0, 18);
    if (!clean) return;
    player.name = clean;
    this.state.version += 1;
  }

  setConnected(id: string, connected: boolean): void {
    const player = this.find(id);
    if (!player) return;
    player.connected = connected;
    this.state.version += 1;
  }

  // -------------------------------------------------------------- settings

  /** Host-only room settings. Every change resets the lobby readiness. */
  updateSettings(byId: string, patch: Partial<RoomSettings>): ActionOk {
    if (byId !== this.state.hostId) return fail('err.host');
    if (this.state.phase !== 'lobby') return fail('err.phase');
    const settings = this.state.settings;
    const next: RoomSettings = { ...settings, ...patch };

    next.name = (patch.name ?? settings.name).trim().slice(0, 40);
    next.maxPlayers = clamp(
      Math.round(patch.maxPlayers ?? settings.maxPlayers),
      settings.custom ? 2 : MIN_PLAYERS,
      settings.custom ? TECHNICAL_MAX_PLAYERS : MAX_PLAYERS,
    );
    next.nightSeconds = clamp(Math.round(patch.nightSeconds ?? settings.nightSeconds), 10, 180);
    next.discussionSeconds = clamp(
      Math.round(patch.discussionSeconds ?? settings.discussionSeconds),
      15,
      300,
    );
    next.votingSeconds = clamp(Math.round(patch.votingSeconds ?? settings.votingSeconds), 10, 180);
    next.revealSeconds = clamp(Math.round(patch.revealSeconds ?? settings.revealSeconds), 3, 30);
    next.hasPassword = Boolean(patch.hasPassword ?? settings.hasPassword);
    next.openByLink = Boolean(patch.openByLink ?? settings.openByLink);
    next.fillWithBots = Boolean(patch.fillWithBots ?? settings.fillWithBots);
    next.manualPhases = Boolean(patch.manualPhases ?? settings.manualPhases);
    next.allowIncomplete = Boolean(patch.allowIncomplete ?? settings.allowIncomplete);
    next.voiceEnabled = Boolean(patch.voiceEnabled ?? settings.voiceEnabled);
    next.maniacWinRule = patch.maniacWinRule === 'faction' ? 'faction' : 'alone';
    next.roleSet = patch.roleSet === 'custom' ? 'custom' : 'standard';

    if (next.roleSet === 'standard') {
      next.composition = standardComposition(
        Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, this.state.players.length || MIN_PLAYERS)),
      );
    } else {
      next.composition = normalizeComposition(
        patch.composition ?? settings.composition,
      );
      if (!isCompositionSane(next.composition)) return fail('err.composition');
    }

    this.state.settings = next;
    this.state.config.nightSeconds = next.nightSeconds;
    this.state.config.discussionSeconds = next.discussionSeconds;
    this.state.config.votingSeconds = next.votingSeconds;
    this.state.config.revealSeconds = next.revealSeconds;
    this.pushLog('log.settingsChanged');
    this.resetReadiness();
    this.state.version += 1;
    return ok();
  }

  /** Host-only custom composition. */
  setComposition(byId: string, composition: RoomSettings['composition']): ActionOk {
    if (byId !== this.state.hostId) return fail('err.host');
    if (this.state.phase !== 'lobby') return fail('err.phase');
    const clean = normalizeComposition(composition);
    if (!isCompositionSane(clean)) return fail('err.composition');
    if (compositionTotal(clean) > TECHNICAL_MAX_PLAYERS) return fail('err.composition');
    this.state.settings = {
      ...this.state.settings,
      roleSet: 'custom',
      composition: clean,
      maxPlayers: Math.max(
        this.state.settings.maxPlayers,
        Math.min(TECHNICAL_MAX_PLAYERS, compositionTotal(clean)),
      ),
    };
    this.pushLog('log.compositionChanged', { total: compositionTotal(clean) });
    this.resetReadiness();
    this.state.version += 1;
    return ok();
  }

  resetComposition(byId: string): ActionOk {
    if (byId !== this.state.hostId) return fail('err.host');
    if (this.state.phase !== 'lobby') return fail('err.phase');
    const count = Math.max(
      MIN_PLAYERS,
      Math.min(MAX_PLAYERS, this.state.players.length || MIN_PLAYERS),
    );
    this.state.settings = {
      ...this.state.settings,
      roleSet: 'standard',
      composition: standardComposition(count),
    };
    this.pushLog('log.compositionChanged', { total: compositionTotal(this.state.settings.composition) });
    this.resetReadiness();
    this.state.version += 1;
    return ok();
  }

  /** Host-only flag: whether the room asks for a password. */
  setPasswordFlag(byId: string, hasPassword: boolean): ActionOk {
    if (byId !== this.state.hostId) return fail('err.host');
    if (this.state.phase !== 'lobby') return fail('err.phase');
    this.state.settings = { ...this.state.settings, hasPassword: Boolean(hasPassword) };
    this.pushLog('log.settingsChanged');
    this.resetReadiness();
    this.state.version += 1;
    return ok();
  }

  /** Settings changes invalidate every ready flag of the human players. */
  resetReadiness(): void {
    for (const player of this.state.players) {
      if (!player.isBot) player.lobbyReady = false;
    }
  }

  private lobbyReadyUp(player: PlayerState, ready: boolean): ActionOk {
    if (this.state.phase !== 'lobby') return fail('err.phase');
    if (player.isBot) return fail('err.role');
    player.lobbyReady = ready;
    this.state.version += 1;
    return ok();
  }

  // ---------------------------------------------------------------- match

  startMatch(byId: string, now: number): ActionOk {
    if (this.state.phase !== 'lobby') return fail('err.phase');
    if (byId !== this.state.hostId) return fail('err.host');
    const settings = this.state.settings;
    const humans = this.state.players.filter((player) => !player.isBot);

    let deck: Role[];
    if (settings.roleSet === 'custom') {
      const total = compositionTotal(settings.composition);
      if (!isCompositionSane(settings.composition)) return fail('err.composition');
      if (total > TECHNICAL_MAX_PLAYERS) return fail('err.composition');
      if (this.state.players.length > total) return fail('err.composition');
      if (this.state.players.length < total && !settings.allowIncomplete) return fail('err.composition');
      if (this.state.players.length < 2) return fail('err.players');
      deck = this.rng.shuffle(compositionToRoles(settings.composition));
    } else {
      if (this.state.players.length < MIN_PLAYERS) return fail('err.players');
      if (this.state.players.length > MAX_PLAYERS) return fail('err.full');
      deck = this.rng.shuffle(roleDeck(this.state.players.length));
    }

    if (!humans.every((player) => player.lobbyReady)) return fail('err.notReady');

    this.state.players.forEach((player, index) => {
      player.role = deck[index] ?? 'citizen';
      player.alive = true;
      player.hasVoted = false;
      player.votedFor = null;
      player.ready = false;
      player.deathDay = null;
      player.deathCause = null;
      player.checks = {};
      this.state.botMemory[player.id] = emptyMemory();
    });
    this.state.day = 1;
    this.state.startedAt = now;
    this.state.winner = null;
    this.state.winReason = null;
    this.state.lastNight = null;
    this.state.lastVote = null;
    this.state.kickVote = null;
    this.pushLog('log.started', { count: this.state.players.length });
    this.beginNight(now);
    return ok();
  }

  restart(byId: string): ActionOk {
    if (this.state.phase !== 'gameover') return fail('err.phase');
    if (byId !== this.state.hostId) return fail('err.host');
    for (const player of this.state.players) {
      player.role = 'citizen';
      player.alive = true;
      player.hasVoted = false;
      player.votedFor = null;
      player.ready = false;
      player.deathDay = null;
      player.deathCause = null;
      player.checks = {};
      this.state.botMemory[player.id] = emptyMemory();
    }
    this.state.phase = 'lobby';
    this.state.day = 0;
    this.state.phaseStartedAt = 0;
    this.state.phaseEndsAt = 0;
    this.state.night = emptyNight();
    this.state.log = [];
    this.state.winner = null;
    this.state.winReason = null;
    this.state.lastNight = null;
    this.state.lastVote = null;
    this.state.kickVote = null;
    this.pushLog('log.restart');
    this.resetReadiness();
    this.state.version += 1;
    return ok();
  }

  // --------------------------------------------------------------- actions

  submit(playerId: string, action: Action, now: number): ActionOk {
    const player = this.find(playerId);
    if (!player) return fail('err.unknown');

    switch (action.type) {
      case 'start':
        return this.startMatch(playerId, now);
      case 'restart':
        return this.restart(playerId);
      case 'advance':
        return this.advance(playerId, now);
      case 'ready':
        return this.readyUp(player, now);
      case 'lobbyReady':
        return this.lobbyReadyUp(player, action.ready);
      case 'chat':
        return this.chat(player, action.text);
      case 'addBot':
        if (playerId !== this.state.hostId) return fail('err.host');
        if (this.state.phase !== 'lobby') return fail('err.phase');
        this.addBot();
        this.resetReadiness();
        return ok();
      case 'removeBot':
        if (playerId !== this.state.hostId) return fail('err.host');
        if (this.state.phase !== 'lobby') return fail('err.phase');
        this.removeLastBot();
        this.resetReadiness();
        return ok();
      case 'fillBots':
        if (playerId !== this.state.hostId) return fail('err.host');
        if (this.state.phase !== 'lobby') return fail('err.phase');
        this.fillBots(action.target);
        this.resetReadiness();
        return ok();
      case 'setName':
        if (this.state.phase !== 'lobby') return fail('err.phase');
        this.setName(playerId, action.name);
        return ok();
      case 'updateSettings':
        return this.updateSettings(playerId, action.patch);
      case 'setComposition':
        return this.setComposition(playerId, action.composition);
      case 'resetComposition':
        return this.resetComposition(playerId);
      case 'setPassword':
        return this.setPasswordFlag(playerId, action.hasPassword);
      case 'kill':
        return this.nightAction(player, 'mafia', action.targetId, now);
      case 'heal':
        return this.nightAction(player, 'doctor', action.targetId, now);
      case 'investigate':
        return this.nightAction(player, 'detective', action.targetId, now);
      case 'sheriffCheck':
        return this.nightAction(player, 'sheriff', action.targetId, now);
      case 'maniacKill':
        return this.nightAction(player, 'maniac', action.targetId, now);
      case 'vote':
        return this.vote(player, action.targetId);
      case 'kickStart':
        return this.startKickVote(player, action.targetId, now);
      case 'kickVote':
        return this.castKickVote(player, action.choice, now);
      default:
        return fail('err.unknown');
    }
  }

  tick(now: number): void {
    const state = this.state;
    this.tickKickVote(now);
    if (state.phase === 'night') {
      const locked = state.night.locked && state.night.lockedAt !== null;
      const graceOver = locked && now - (state.night.lockedAt ?? 0) >= state.config.nightGraceMs;
      if (graceOver || now >= state.phaseEndsAt) {
        this.resolveNight(now);
      }
      return;
    }
    if (state.phase === 'dawn') {
      if (now >= state.phaseEndsAt) {
        if (state.winner) this.finishGame();
        else this.beginDiscussion(now);
      }
      return;
    }
    if (state.phase === 'discussion') {
      if (now >= state.phaseEndsAt) this.beginVoting(now);
      return;
    }
    if (state.phase === 'voting') {
      const elapsed = now - state.phaseStartedAt;
      if ((elapsed >= 1400 && this.allVotesIn()) || now >= state.phaseEndsAt) {
        this.resolveVoting(now);
      }
      return;
    }
    if (state.phase === 'execution') {
      if (now >= state.phaseEndsAt) {
        if (state.winner) {
          this.finishGame();
        } else {
          state.day += 1;
          this.beginNight(now);
        }
      }
    }
  }

  advance(byId: string, now: number): ActionOk {
    if (byId !== this.state.hostId) return fail('err.host');
    if (!this.state.settings.manualPhases) return fail('err.manual');
    switch (this.state.phase) {
      case 'night':
        this.resolveNight(now);
        return ok();
      case 'dawn':
        if (this.state.winner) this.finishGame();
        else this.beginDiscussion(now);
        return ok();
      case 'discussion':
        this.beginVoting(now);
        return ok();
      case 'voting':
        this.resolveVoting(now);
        return ok();
      case 'execution':
        if (this.state.winner) this.finishGame();
        else {
          this.state.day += 1;
          this.beginNight(now);
        }
        return ok();
      case 'lobby':
        return this.startMatch(byId, now);
      default:
        return fail('err.phase');
    }
  }

  private readyUp(player: PlayerState, now: number): ActionOk {
    const state = this.state;
    if (state.phase !== 'discussion' && state.phase !== 'dawn') return fail('err.phase');
    if (!player.alive) return fail('err.dead');
    player.ready = true;
    state.version += 1;
    this.maybeAdvanceDiscussion(now);
    return ok();
  }

  /** Dead players may only watch; they cannot write into the common chat. */
  private chat(player: PlayerState, raw: string): ActionOk {
    const text = raw.trim().slice(0, 180);
    if (!text) return fail('err.unknown');
    const state = this.state;
    if (state.phase === 'lobby' || state.phase === 'gameover') return fail('err.phase');
    if (!player.alive) return fail('err.dead');
    let audience: 'all' | 'mafia' = 'all';
    if (state.phase === 'night') {
      if (player.role !== 'mafia') return fail('err.phase');
      audience = 'mafia';
    }
    this.pushLog('chat.entry', { name: player.name }, {
      audience,
      actorId: player.id,
      text,
    });
    state.version += 1;
    return ok();
  }

  private nightAction(
    player: PlayerState,
    role: Role,
    targetId: string,
    now: number,
  ): ActionOk {
    const state = this.state;
    if (state.phase !== 'night') return fail('err.phase');
    if (!player.alive) return fail('err.dead');
    if (player.role !== role) return fail('err.role');
    const target = this.find(targetId);
    if (!target || !target.alive) return fail('err.target');
    // Only the doctor may pick himself; everybody else needs another target.
    if (target.id === player.id && role !== 'doctor') return fail('err.self');
    if (role === 'mafia' && target.role === 'mafia') return fail('err.target');

    if (role === 'mafia') state.night.mafiaVotes[player.id] = target.id;
    if (role === 'doctor') state.night.doctorTargets[player.id] = target.id;
    if (role === 'detective') state.night.detectiveTargets[player.id] = target.id;
    if (role === 'sheriff') state.night.sheriffTargets[player.id] = target.id;
    if (role === 'maniac') state.night.maniacTargets[player.id] = target.id;

    this.refreshNightLock(now);
    state.version += 1;
    return ok();
  }

  private vote(player: PlayerState, targetId: string | null): ActionOk {
    const state = this.state;
    if (state.phase !== 'voting') return fail('err.phase');
    if (!player.alive) return fail('err.dead');
    if (targetId) {
      const target = this.find(targetId);
      if (!target || !target.alive) return fail('err.target');
      if (target.id === player.id) return fail('err.self');
    }
    player.hasVoted = true;
    player.votedFor = targetId;
    state.version += 1;
    if (targetId) {
      this.pushLog('log.voted', { name: player.name, target: this.nameOf(targetId) });
      for (const other of state.players) {
        if (other.isBot && other.alive && other.id !== player.id) {
          suspicionIncrease(state, other.id, player.id, 1);
        }
      }
    } else {
      this.pushLog('log.abstained', { name: player.name });
    }
    return ok();
  }

  // ------------------------------------------------------------ kick voting

  private startKickVote(player: PlayerState, targetId: string, now: number): ActionOk {
    const state = this.state;
    if (state.phase === 'gameover') return fail('err.phase');
    if (state.kickVote) return fail('err.voteOpen');
    if (now - state.lastKickVoteAt < KICK_COOLDOWN_SECONDS * 1000) return fail('err.cooldown');
    if (targetId === player.id) return fail('err.self');
    const target = this.find(targetId);
    if (!target) return fail('err.target');
    if (target.isBot) return fail('err.target');

    const voters = state.players.filter(
      (item) => item.id !== target.id && !item.isBot && (state.phase === 'lobby' || item.alive),
    );
    if (voters.length < 2) return fail('err.voteOpen');
    const quorum = Math.max(2, Math.ceil(voters.length / 2));

    state.kickVote = {
      id: state.nextKickVoteId,
      targetId,
      initiatorId: player.id,
      votes: {},
      startedAt: now,
      endsAt: now + KICK_VOTE_SECONDS * 1000,
      quorum,
      eligible: voters.length,
    };
    state.nextKickVoteId += 1;
    this.pushLog('log.kickStarted', { name: target.name, by: player.name });
    state.version += 1;
    return ok();
  }

  private castKickVote(player: PlayerState, choice: KickVoteChoice, now: number): ActionOk {
    const state = this.state;
    const vote = state.kickVote;
    if (!vote) return fail('err.voteClosed');
    if (now > vote.endsAt) return fail('err.voteClosed');
    if (player.id === vote.targetId) return fail('err.self');
    if (vote.votes[player.id]) return fail('err.voteClosed');
    vote.votes[player.id] = choice;
    this.pushLog('log.kickVote', { name: player.name, choice });
    state.version += 1;
    this.resolveKickVote(now);
    return ok();
  }

  private tickKickVote(now: number): void {
    const state = this.state;
    const vote = state.kickVote;
    if (!vote) return;
    if (now <= vote.endsAt) return;
    state.kickVote = null;
    state.lastKickVoteAt = now;
    const target = this.find(vote.targetId);
    this.pushLog('log.kickFailed', { name: target?.name ?? '—' });
    state.version += 1;
  }

  private resolveKickVote(now: number): void {
    const state = this.state;
    const vote = state.kickVote;
    if (!vote) return;
    const yes = Object.values(vote.votes).filter((choice) => choice === 'yes').length;
    const no = Object.values(vote.votes).filter((choice) => choice === 'no').length;
    if (yes < vote.quorum || yes <= no) return;

    state.kickVote = null;
    state.lastKickVoteAt = now;
    const target = this.find(vote.targetId);
    if (!target) return;
    this.pushLog('log.kickPassed', { name: target.name });
    if (state.phase === 'lobby') {
      this.removePlayer(target.id);
      this.resetReadiness();
    } else {
      // The seat stays in the match, but the character is handed to a bot.
      this.markDisconnected(target.id);
    }
    state.version += 1;
  }

  // ------------------------------------------------------------- lifecycle

  markDisconnected(id: string): void {
    const player = this.find(id);
    if (!player) return;
    player.connected = false;
    if (this.state.phase === 'lobby') {
      this.removePlayer(id);
      return;
    }
    if (!player.isBot) {
      player.isBot = true;
      this.pushLog('log.autopilot', { name: player.name });
      this.autoAct(player);
    }
    this.state.version += 1;
  }

  /** Bot takes over an absent human immediately. */
  autoAct(player: PlayerState): void {
    if (!player.alive) return;
    const state = this.state;
    if (state.phase === 'night') {
      this.botNightAction(player);
      return;
    }
    if (state.phase === 'voting' && !player.hasVoted) {
      const target = chooseVote(state, this.rng, player);
      player.hasVoted = true;
      player.votedFor = target;
      if (target) {
        this.pushLog('log.voted', { name: player.name, target: this.nameOf(target) });
      } else {
        this.pushLog('log.abstained', { name: player.name });
      }
      return;
    }
    if (state.phase === 'discussion' && !player.ready) {
      player.ready = true;
      this.pushLog('log.autoReady', { name: player.name });
      this.maybeAdvanceDiscussion(Date.now());
    }
  }

  private beginNight(now: number): void {
    const state = this.state;
    state.phase = 'night';
    state.phaseStartedAt = now;
    state.phaseEndsAt = now + state.config.nightSeconds * 1000;
    state.night = emptyNight();
    state.lastVote = null;
    for (const player of state.players) {
      player.hasVoted = false;
      player.votedFor = null;
      player.ready = false;
    }
    this.pushLog('log.night', { day: state.day });
    for (const player of state.players) {
      if (player.alive && player.isBot) this.botNightAction(player);
    }
    this.refreshNightLock(now);
    state.version += 1;
  }

  private botNightAction(player: PlayerState): void {
    const choice = botNightChoice(this.state, this.rng, player);
    if (!choice.targetId) return;
    const night = this.state.night;
    if (choice.role === 'mafia') night.mafiaVotes[player.id] = choice.targetId;
    if (choice.role === 'doctor') night.doctorTargets[player.id] = choice.targetId;
    if (choice.role === 'detective') night.detectiveTargets[player.id] = choice.targetId;
    if (choice.role === 'sheriff') night.sheriffTargets[player.id] = choice.targetId;
    if (choice.role === 'maniac') night.maniacTargets[player.id] = choice.targetId;
    this.state.botMemory[player.id] = {
      ...(this.state.botMemory[player.id] ?? emptyMemory()),
      lastTarget: choice.targetId,
    };
  }

  /** Every living role has acted — the night choice is locked but still correctable. */
  private refreshNightLock(now: number): void {
    const state = this.state;
    const night = state.night;
    if (night.locked) return;
    if (!this.allNightActionsIn()) return;
    night.locked = true;
    night.lockedAt = now;
    this.pushLog('log.nightLocked');
  }

  private allNightActionsIn(): boolean {
    const state = this.state;
    const night = state.night;
    for (const player of state.players) {
      if (!player.alive) continue;
      if (player.role === 'mafia' && !night.mafiaVotes[player.id]) return false;
      if (player.role === 'doctor' && !night.doctorTargets[player.id]) return false;
      if (player.role === 'detective' && !night.detectiveTargets[player.id]) return false;
      if (player.role === 'sheriff' && !night.sheriffTargets[player.id]) return false;
      if (player.role === 'maniac' && !night.maniacTargets[player.id]) return false;
    }
    return true;
  }

  private allVotesIn(): boolean {
    return this.state.players.every((player) => !player.alive || player.hasVoted);
  }

  private resolveNight(now: number): void {
    const state = this.state;
    const night = state.night;
    const deaths: NightReport['deaths'] = [];
    const doctorTargets = new Set(Object.values(night.doctorTargets));
    let saved = false;

    const strike = (targetId: string | null, cause: 'mafia' | 'maniac') => {
      if (!targetId) return;
      const target = this.find(targetId);
      if (!target || !target.alive) return;
      if (doctorTargets.has(target.id)) {
        saved = true;
        return;
      }
      target.alive = false;
      target.deathDay = state.day;
      target.deathCause = cause;
      deaths.push({ id: target.id, role: target.role });
    };

    const mafiaTarget = this.mafiaChoice();
    if (mafiaTarget === 'split') {
      this.pushLog('log.mafiaSplit', undefined, { audience: 'mafia' });
    } else {
      strike(mafiaTarget, 'mafia');
    }
    // Every maniac acts on their own.
    for (const targetId of Object.values(night.maniacTargets)) {
      strike(targetId, 'maniac');
    }

    for (const [detectiveId, targetId] of Object.entries(night.detectiveTargets)) {
      const detective = this.find(detectiveId);
      const target = this.find(targetId);
      if (!detective || !target) continue;
      const result = checkResultFor(target.role, false);
      detective.checks[target.id] = result;
      this.pushLog(result === 'clean' ? 'log.check.clean' : 'log.check.mafia', { name: target.name }, {
        audience: 'private',
        toId: detective.id,
      });
    }
    for (const [sheriffId, targetId] of Object.entries(night.sheriffTargets)) {
      const sheriff = this.find(sheriffId);
      const target = this.find(targetId);
      if (!sheriff || !target) continue;
      const result = checkResultFor(target.role, true);
      sheriff.checks[target.id] = result;
      const code = result === 'clean' ? 'log.check.clean' : result === 'mafia' ? 'log.check.mafia' : 'log.check.maniac';
      this.pushLog(code, { name: target.name }, {
        audience: 'private',
        toId: sheriff.id,
      });
    }
    for (const [doctorId, targetId] of Object.entries(night.doctorTargets)) {
      const doctor = this.find(doctorId);
      if (!doctor) continue;
      this.pushLog('log.savedPrivate', { name: this.nameOf(targetId) }, {
        audience: 'private',
        toId: doctor.id,
      });
    }

    state.lastNight = { day: state.day, deaths, saved };
    state.phase = 'dawn';
    state.phaseStartedAt = now;
    state.phaseEndsAt = now + state.config.revealSeconds * 1000;
    state.winner = null;
    state.winReason = null;
    state.night.locked = false;
    state.night.lockedAt = null;
    this.pushLog('log.dawn', { day: state.day });
    if (deaths.length === 0) {
      this.pushLog('log.noDeath');
    } else {
      for (const death of deaths) {
        this.pushLog('log.killed', { name: this.nameOf(death.id), role: death.role });
      }
    }
    this.computeWinner();
    state.version += 1;
  }

  /** Majority of the mafia votes. A tie means the family did not agree. */
  private mafiaChoice(): string | null | 'split' {
    const votes = Object.values(this.state.night.mafiaVotes);
    if (votes.length === 0) return null;
    const counts = new Map<string, number>();
    for (const targetId of votes) {
      counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [targetId, count] of counts) {
      if (count > bestCount) {
        best = targetId;
        bestCount = count;
      }
    }
    if (!best) return null;
    const tied = [...counts.entries()].filter(([, count]) => count === bestCount);
    if (tied.length > 1) return 'split';
    return best;
  }

  private beginDiscussion(now: number): void {
    const state = this.state;
    state.phase = 'discussion';
    state.phaseStartedAt = now;
    state.phaseEndsAt = now + state.config.discussionSeconds * 1000;
    for (const player of state.players) player.ready = player.isBot;
    this.pushLog('log.discussion', { day: state.day });
    this.botChatter();
    state.version += 1;
  }

  private botChatter(): void {
    const state = this.state;
    if (!state.config.botChatter) return;
    const bots = state.players.filter((player) => player.alive && player.isBot);
    this.rng.shuffle(bots);
    const speakers = bots.slice(0, Math.min(2, bots.length));
    for (const bot of speakers) {
      const line = chooseChatLine(state, this.rng, bot);
      if (!line) continue;
      this.pushLog(line.code, line.params ?? {}, {
        audience: 'all',
        actorId: bot.id,
      });
    }
  }

  /** Discussion ends as soon as every living human is ready. */
  private maybeAdvanceDiscussion(now: number): void {
    const state = this.state;
    if (state.phase !== 'discussion') return;
    const livingHumans = state.players.filter((player) => player.alive && !player.isBot);
    if (livingHumans.length === 0) return;
    if (!livingHumans.every((player) => player.ready)) return;
    this.beginVoting(now);
  }

  private beginVoting(now: number): void {
    const state = this.state;
    state.phase = 'voting';
    state.phaseStartedAt = now;
    state.phaseEndsAt = now + state.config.votingSeconds * 1000;
    for (const player of state.players) {
      player.hasVoted = false;
      player.votedFor = null;
      player.ready = false;
    }
    this.pushLog('log.voteStarted', { day: state.day });
    for (const player of state.players) {
      if (!player.alive || !player.isBot) continue;
      const target = chooseVote(state, this.rng, player);
      player.hasVoted = true;
      player.votedFor = target;
      if (target) {
        this.pushLog('log.voted', { name: player.name, target: this.nameOf(target) });
      } else {
        this.pushLog('log.abstained', { name: player.name });
      }
    }
    state.version += 1;
  }

  private resolveVoting(now: number): void {
    const state = this.state;
    const counts: Record<string, number> = {};
    let abstains = 0;
    for (const player of state.players) {
      if (!player.alive) continue;
      if (!player.hasVoted || !player.votedFor) {
        abstains += 1;
        continue;
      }
      counts[player.votedFor] = (counts[player.votedFor] ?? 0) + 1;
    }
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = ranked[0];
    const tie = ranked.length > 1 && ranked[1]![1] === top![1];
    // Rule: the candidate needs strictly more votes than every other candidate
    // and more votes than the number of abstentions. A tie excludes nobody.
    const executedId = top && !tie && top[1] > abstains ? top[0] : null;

    const report: VoteReport = {
      day: state.day,
      counts,
      abstains,
      executedId,
      tie: Boolean(tie),
    };
    state.lastVote = report;
    state.phase = 'execution';
    state.phaseStartedAt = now;
    state.phaseEndsAt = now + state.config.revealSeconds * 1000;
    state.winner = null;
    state.winReason = null;

    if (executedId) {
      const target = this.find(executedId);
      if (target) {
        target.alive = false;
        target.deathDay = state.day;
        target.deathCause = 'vote';
        this.pushLog('log.executed', { name: target.name, role: target.role });
      }
    } else {
      this.pushLog('log.noExecution');
    }
    this.computeWinner();
    state.version += 1;
  }

  /**
   * Win conditions (identical in the engine, the UI and the rules):
   * - the city wins when no mafia and no maniac are left;
   * - the mafia wins when there are at least as many mafia as city players;
   * - the maniac wins when it is the last living player ("alone", default) or,
   *    in the "faction" mode, when every living player is a maniac.
   */
  private computeWinner(): void {
    const state = this.state;
    const alive = state.players.filter((player) => player.alive);
    const mafia = alive.filter((player) => player.role === 'mafia').length;
    const maniacs = alive.filter((player) => player.role === 'maniac').length;
    const city = alive.length - mafia - maniacs;

    if (alive.length === 0) {
      state.winner = 'city';
      state.winReason = 'log.win.city';
      return;
    }
    if (maniacs > 0) {
      if (state.settings.maniacWinRule === 'faction' && city === 0 && mafia === 0) {
        state.winner = 'maniac';
        state.winReason = 'log.win.maniac';
        return;
      }
      if (state.settings.maniacWinRule === 'alone' && alive.length === 1) {
        state.winner = 'maniac';
        state.winReason = 'log.win.maniac';
        return;
      }
    }
    if (mafia === 0 && maniacs === 0) {
      state.winner = 'city';
      state.winReason = 'log.win.city';
      return;
    }
    if (mafia > 0 && mafia >= city) {
      state.winner = 'mafia';
      state.winReason = 'log.win.mafia';
    }
  }

  private finishGame(): void {
    const state = this.state;
    state.phase = 'gameover';
    state.phaseStartedAt = Date.now();
    state.phaseEndsAt = 0;
    if (state.winReason) this.pushLog(state.winReason);
    state.version += 1;
  }

  // ---------------------------------------------------------------- utils

  find(id: string): PlayerState | null {
    return this.state.players.find((player) => player.id === id) ?? null;
  }

  nameOf(id: string): string {
    return this.find(id)?.name ?? '—';
  }

  alive(): PlayerState[] {
    return this.state.players.filter((player) => player.alive);
  }

  private pushLog(
    code: string,
    params?: Record<string, string | number>,
    options: LogOptions = {},
  ): void {
    const entry: LogEntry = {
      id: this.state.nextLogId,
      day: this.state.day,
      phase: this.state.phase,
      code,
      params,
      audience: options.audience ?? 'all',
      ...(options.toId ? { toId: options.toId } : {}),
      ...(options.actorId ? { actorId: options.actorId } : {}),
      ...(options.text ? { text: options.text } : {}),
    };
    this.state.nextLogId += 1;
    this.state.log.push(entry);
    if (this.state.log.length > 240) this.state.log.splice(0, this.state.log.length - 240);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function emptyNight() {
  return {
    mafiaVotes: {} as Record<string, string>,
    doctorTargets: {} as Record<string, string>,
    detectiveTargets: {} as Record<string, string>,
    sheriffTargets: {} as Record<string, string>,
    maniacTargets: {} as Record<string, string>,
    locked: false,
    lockedAt: null,
  };
}

function emptyMemory(): BotMemory {
  return { suspicion: {}, lastTarget: null };
}

function ok(): ActionOk {
  return { ok: true };
}

function fail(error: string): ActionOk {
  return { ok: false, error };
}
