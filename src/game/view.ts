import { MAX_PLAYERS, MIN_PLAYERS, TECHNICAL_MAX_PLAYERS } from './types';
import type {
  CheckResult,
  DeathCause,
  GameState,
  KickVote,
  LogEntry,
  MatchStats,
  NightChoiceKind,
  NightReport,
  Phase,
  PlayerState,
  Role,
  RoomSettings,
  RoundStat,
  VoteReport,
  Winner,
} from './types';
import { compositionCounts, compositionTotal, standardComposition, ROLE_INFO } from './roles';

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
  /** The mayor revealed themselves in the open. */
  revealed: boolean;
  /** The player won on their own without ending the match. */
  personalWin: boolean;
}

export interface ViewMe {
  id: string;
  name: string;
  role: Role;
  alive: boolean;
  isHost: boolean;
  isBot: boolean;
  revealed: boolean;
  personalWin: boolean;
  /** Remaining uses of limited abilities. */
  uses: Record<string, number>;
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
  /** The night actions the viewer may perform right now. */
  myNightKinds: NightChoiceKind[];
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
  /** Aggregated statistics of the match (visible to every viewer). */
  stats: MatchStats;
  /** Statistics of the finished rounds. */
  roundStats: RoundStat[];
}

export function buildView(state: GameState, viewerId: string | null, now: number): GameView {
  const me = viewerId ? state.players.find((player) => player.id === viewerId) ?? null : null;
  const meRole = me?.role ?? null;
  const mafiaViewer = meRole ? ROLE_INFO[meRole].faction === 'mafia' : false;
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
      isMe || !player.alive || gameOver || (mafiaViewer && ROLE_INFO[player.role].faction === 'mafia');
    const canCheck =
      meRole === 'detective' || meRole === 'sheriff' || meRole === 'medium';
    const checkValue = canCheck ? me?.checks[player.id] : undefined;
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
        mafiaViewer && !isMe && player.alive && ROLE_INFO[player.role].faction === 'mafia',
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
      revealed: player.revealed,
      personalWin: state.personalWinners.includes(player.id),
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

  // The choice of the viewer for the current night.
  let myTarget: string | null = null;
  const myNightKinds = me ? allowedKinds(state, me) : [];
  if (me?.alive && state.phase === 'night') {
    for (const kind of myNightKinds) {
      myTarget = state.night.choices[kind][me.id] ?? null;
      if (myTarget) break;
    }
  }

  const myChecks = me
    ? Object.entries(me.checks).map(([id, result]) => ({ id, result: result as CheckResult }))
    : [];

  const mafiaVotes = mafiaViewer ? { ...state.night.choices.mafia } : null;

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
          revealed: me.revealed,
          personalWin: state.personalWinners.includes(me.id),
          uses: { ...me.uses },
        }
      : null,
    players,
    hostId: state.hostId,
    log,
    myTarget,
    myNightKinds,
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
    stats: {
      ...state.stats,
      checks: { ...state.stats.checks },
      deathsByCause: { ...state.stats.deathsByCause },
    },
    roundStats: state.roundStats.map((round) => ({ ...round, votes: { ...round.votes } })),
  };
}

/**
 * The night actions the player may perform. The nurse only inherits the
 * healing when no doctor is alive.
 */
export function allowedKinds(state: GameState, player: PlayerState): Array<
  keyof GameState['night']['choices']
> {
  const info = ROLE_INFO[player.role];
  if (info.nightAction === 'none') return [];
  if (player.role === 'nurse') {
    const doctorAlive = state.players.some((item) => item.alive && item.role === 'doctor');
    return doctorAlive ? [] : ['heal'];
  }
  if (player.role === 'mafiaBoss') return ['mafia'];
  return [info.nightAction];
}
