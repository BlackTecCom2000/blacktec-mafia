import { MAX_PLAYERS, MIN_PLAYERS, TECHNICAL_MAX_PLAYERS } from './types';
import type {
  CheckResult,
  DeathCause,
  GameState,
  KickVote,
  LogEntry,
  NightReport,
  Phase,
  Role,
  RoomSettings,
  VoteReport,
  Winner,
} from './types';
import { compositionCounts, compositionTotal, standardComposition } from './roles';

export interface ViewPlayer {
  id: string;
  name: string;
  seat: number;
  alive: boolean;
  isBot: boolean;
  connected: boolean;
  role: Role | null;
  roleVisible: boolean;
  isMe: boolean;
  isHost: boolean;
  isTeammate: boolean;
  hasVoted: boolean;
  votedFor: string | null;
  votes: number;
  deathDay: number | null;
  deathCause: DeathCause;
  check: CheckResult | null;
  ready: boolean;
  lobbyReady: boolean;
}

export interface ViewMe {
  id: string;
  name: string;
  role: Role;
  alive: boolean;
  isHost: boolean;
  isBot: boolean;
}

export interface GameView {
  version: number;
  phase: Phase;
  day: number;
  now: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  me: ViewMe | null;
  players: ViewPlayer[];
  hostId: string;
  log: LogEntry[];
  myTarget: string | null;
  myChecks: Array<{ id: string; result: CheckResult }>;
  mafiaVotes: Record<string, string> | null;
  lastNight: NightReport | null;
  lastVote: VoteReport | null;
  winner: Winner;
  winReason: string | null;
  minPlayers: number;
  maxPlayers: number;
  roleCounts: Partial<Record<Role, number>> | null;
  /** Room settings (never contains the password itself). */
  settings: RoomSettings;
  /** Total number of roles in the effective composition. */
  rolesTotal: number;
  /** Number of players that confirmed readiness in the lobby. */
  readyCount: number;
  /** Number of human players that have to confirm readiness. */
  readyNeeded: number;
  /** The night choice is locked, a short correction window is still open. */
  nightLocked: boolean;
  nightLockedAt: number | null;
  kickVote: KickVote | null;
}

export function buildView(state: GameState, viewerId: string | null, now: number): GameView {
  const me = viewerId ? state.players.find((player) => player.id === viewerId) ?? null : null;
  const meRole = me?.role ?? null;
  const mafiaViewer = meRole === 'mafia';
  const gameOver = state.phase === 'gameover';

  const votes: Record<string, number> = {};
  if (state.phase === 'voting' || state.phase === 'execution' || gameOver) {
    for (const player of state.players) {
      if (player.votedFor) votes[player.votedFor] = (votes[player.votedFor] ?? 0) + 1;
    }
  }

  const players: ViewPlayer[] = state.players.map((player) => {
    const isMe = player.id === me?.id;
    const roleVisible =
      isMe || !player.alive || gameOver || (mafiaViewer && player.role === 'mafia');
    const checkValue = me?.role === 'detective' || me?.role === 'sheriff' ? me.checks[player.id] : undefined;
    return {
      id: player.id,
      name: player.name,
      seat: player.seat,
      alive: player.alive,
      isBot: player.isBot,
      connected: player.connected,
      role: roleVisible ? player.role : null,
      roleVisible,
      isMe,
      isHost: player.id === state.hostId,
      isTeammate: Boolean(
        mafiaViewer && !isMe && player.alive && player.role === 'mafia' && meRole === 'mafia',
      ),
      hasVoted: player.hasVoted,
      votedFor:
        state.phase === 'voting' || state.phase === 'execution' || gameOver
          ? player.votedFor
          : null,
      votes: votes[player.id] ?? 0,
      deathDay: player.deathDay,
      deathCause: player.deathCause,
      check: checkValue ?? null,
      ready: player.ready,
      lobbyReady: player.lobbyReady,
    };
  });

  const log = state.log.filter((entry) => {
    const audience = entry.audience ?? 'all';
    if (audience === 'all') return true;
    if (audience === 'mafia') return mafiaViewer;
    if (audience === 'private') return entry.toId === viewerId;
    if (audience === 'dead') return Boolean(me && !me.alive);
    return false;
  });

  let myTarget: string | null = null;
  if (me?.alive && state.phase === 'night') {
    if (me.role === 'mafia') myTarget = state.night.mafiaVotes[me.id] ?? null;
    if (me.role === 'doctor') myTarget = state.night.doctorTargets[me.id] ?? null;
    if (me.role === 'detective') myTarget = state.night.detectiveTargets[me.id] ?? null;
    if (me.role === 'sheriff') myTarget = state.night.sheriffTargets[me.id] ?? null;
    if (me.role === 'maniac') myTarget = state.night.maniacTargets[me.id] ?? null;
  }

  const myChecks = me
    ? Object.entries(me.checks).map(([id, result]) => ({ id, result: result as CheckResult }))
    : [];

  const mafiaVotes = mafiaViewer ? { ...state.night.mafiaVotes } : null;

  const settings = state.settings;
  const effectiveComposition =
    settings.roleSet === 'custom'
      ? settings.composition
      : standardComposition(
          Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, state.players.length || MIN_PLAYERS)),
        );
  const rolesTotal = compositionTotal(effectiveComposition);
  const humans = state.players.filter((player) => !player.isBot);
  const readyNeeded = humans.length;
  const readyCount = humans.filter((player) => player.lobbyReady).length;

  return {
    version: state.version,
    phase: state.phase,
    day: state.day,
    now,
    phaseStartedAt: state.phaseStartedAt,
    phaseEndsAt: state.phaseEndsAt,
    me: me
      ? {
          id: me.id,
          name: me.name,
          role: me.role,
          alive: me.alive,
          isHost: me.id === state.hostId,
          isBot: me.isBot,
        }
      : null,
    players,
    hostId: state.hostId,
    log,
    myTarget,
    myChecks,
    mafiaVotes,
    lastNight: state.lastNight,
    lastVote: state.lastVote,
    winner: state.winner,
    winReason: state.winReason,
    minPlayers: settings.custom ? 2 : MIN_PLAYERS,
    maxPlayers: Math.min(settings.maxPlayers, TECHNICAL_MAX_PLAYERS),
    roleCounts: state.phase === 'lobby' ? compositionCounts(effectiveComposition) : null,
    settings,
    rolesTotal,
    readyCount,
    readyNeeded,
    nightLocked: state.night.locked,
    nightLockedAt: state.night.lockedAt,
    kickVote: state.kickVote,
  };
}
