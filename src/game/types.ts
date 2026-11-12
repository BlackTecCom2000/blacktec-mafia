/** Core domain types for the BlackTec Mafia engine. */

/**
 * Base roles are used in the standard decks. The rest are optional and can
 * only be used in a custom room.
 */
export type Role =
  | 'mafia'
  | 'doctor'
  | 'detective'
  | 'citizen'
  | 'maniac'
  | 'sheriff'
  | 'bodyguard'
  | 'avenger'
  | 'mayor'
  | 'medium'
  | 'nurse'
  | 'mafiaBoss'
  | 'blocker'
  | 'framer'
  | 'joker';

export type Faction = 'mafia' | 'city' | 'maniac';

/** Result of a night investigation. */
export type CheckResult = 'mafia' | 'maniac' | 'clean';

export type Phase =
  | 'lobby'
  | 'night'
  | 'dawn'
  | 'discussion'
  | 'voting'
  | 'execution'
  | 'gameover';

export type Winner = 'mafia' | 'city' | 'maniac' | 'joker' | null;

export type DeathCause = 'mafia' | 'maniac' | 'avenger' | 'guard' | 'vote' | null;

export const MIN_PLAYERS = 6;
export const MAX_PLAYERS = 12;
/** Hard technical limit for custom rooms (no artificial 12-player cap). */
export const TECHNICAL_MAX_PLAYERS = 24;

/** How many of each role the table gets. */
export type RoleComposition = Record<Role, number>;

export type RoleSetMode = 'standard' | 'custom';

/**
 * `alone`  — the last living maniac wins on their own.
 * `faction` — the maniacs win together when every other side is gone.
 */
export type ManiacWinRule = 'alone' | 'faction';

export interface RoomSettings {
  /** Display name of the room. */
  name: string;
  /** Custom rooms allow any composition and up to TECHNICAL_MAX_PLAYERS. */
  custom: boolean;
  /** Whether a password is required. The password itself never lives here. */
  hasPassword: boolean;
  maxPlayers: number;
  /** Allow joining by invite link without a code. */
  openByLink: boolean;
  /** Fill free seats with bots automatically. */
  fillWithBots: boolean;
  nightSeconds: number;
  discussionSeconds: number;
  votingSeconds: number;
  revealSeconds: number;
  /** Manual phase control: the host may move phases by hand. */
  manualPhases: boolean;
  roleSet: RoleSetMode;
  composition: RoleComposition;
  /** Allow starting with fewer players than the composition needs. */
  allowIncomplete: boolean;
  maniacWinRule: ManiacWinRule;
  /** Voice chat is allowed in this room. */
  voiceEnabled: boolean;
  /** The doctor may protect the same player two nights in a row. */
  doctorCanRepeatTarget: boolean;
  /** The mafia boss can look clean to the investigator. */
  mafiaBossHides: boolean;
  /** The joker's victory ends the whole match. */
  jokerEndsGame: boolean;
  /** How many shots the avenger has. */
  avengerShots: number;
  /** How many times the mayor may reveal themselves. */
  mayorReveals: number;
  /** A player killed at night loses the result of their investigation. */
  nightDeathCancelsCheck: boolean;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  name: '',
  custom: false,
  hasPassword: false,
  maxPlayers: MAX_PLAYERS,
  openByLink: true,
  fillWithBots: false,
  nightSeconds: 24,
  discussionSeconds: 60,
  votingSeconds: 35,
  revealSeconds: 6,
  manualPhases: false,
  roleSet: 'standard',
  composition: {
    mafia: 2,
    doctor: 1,
    detective: 1,
    citizen: 3,
    maniac: 0,
    sheriff: 0,
    bodyguard: 0,
    avenger: 0,
    mayor: 0,
    medium: 0,
    nurse: 0,
    mafiaBoss: 0,
    blocker: 0,
    framer: 0,
    joker: 0,
  },
  allowIncomplete: false,
  maniacWinRule: 'alone',
  voiceEnabled: true,
  doctorCanRepeatTarget: true,
  mafiaBossHides: true,
  jokerEndsGame: false,
  avengerShots: 2,
  mayorReveals: 1,
  nightDeathCancelsCheck: true,
};

export interface GameConfig {
  nightSeconds: number;
  discussionSeconds: number;
  votingSeconds: number;
  revealSeconds: number;
  seed: number;
  botChatter: boolean;
  /** Grace window (ms) to correct a locked night choice. */
  nightGraceMs: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  nightSeconds: 24,
  discussionSeconds: 60,
  votingSeconds: 35,
  revealSeconds: 6,
  seed: 1,
  botChatter: true,
  nightGraceMs: 3000,
};

/** The kind of night action a role performs. */
export type NightActionKind =
  | 'none'
  | 'mafia'
  | 'heal'
  | 'check'
  | 'checkAny'
  | 'kill'
  | 'guard'
  | 'shot'
  | 'block'
  | 'frame'
  | 'question';

export interface PlayerState {
  id: string;
  name: string;
  seat: number;
  role: Role;
  alive: boolean;
  isBot: boolean;
  connected: boolean;
  hasVoted: boolean;
  votedFor: string | null;
  /** Ready flag for the current discussion phase. */
  ready: boolean;
  /** Ready flag for the lobby. */
  lobbyReady: boolean;
  deathDay: number | null;
  deathCause: DeathCause;
  /** Investigator knowledge: target id -> result. */
  checks: Record<string, CheckResult>;
  /** Remaining uses of limited abilities (mayor, avenger, medium). */
  uses: Record<string, number>;
  /** The mayor revealed themselves in the open. */
  revealed: boolean;
  /** The player came through the backup channel of the room service. */
  relay?: boolean;
  /** The player the doctor protected the previous night. */
  lastHealTarget: string | null;
}

/** The night action kinds that actually store a choice. */
export type NightChoiceKind = Exclude<NightActionKind, 'none'>;

export interface NightState {
  /** Action kind -> player id -> target id. */
  choices: Record<NightChoiceKind, Record<string, string>>;
  /** True once every required night action has been submitted. */
  locked: boolean;
  /** When the choices were locked (grace window start). */
  lockedAt: number | null;
}

export interface NightReport {
  day: number;
  deaths: Array<{ id: string; role: Role; cause: DeathCause }>;
  saved: boolean;
}

export interface VoteReport {
  day: number;
  counts: Record<string, number>;
  abstains: number;
  executedId: string | null;
  tie: boolean;
}

export interface LogEntry {
  id: number;
  day: number;
  phase: Phase;
  code: string;
  params?: Record<string, string | number>;
  text?: string;
  actorId?: string;
  /** "mafia" entries are only visible to the mafia team, "private" only to `toId`. */
  audience?: 'all' | 'mafia' | 'private' | 'dead';
  toId?: string;
}

export interface BotMemory {
  /** How much this bot distrusts each player. */
  suspicion: Record<string, number>;
  /** Last targets the bot picked, to avoid repeating itself. */
  lastTarget: string | null;
}

export type KickVoteChoice = 'yes' | 'no';

export interface KickVote {
  id: number;
  targetId: string;
  initiatorId: string;
  votes: Record<string, KickVoteChoice>;
  startedAt: number;
  endsAt: number;
  /** Number of votes required for the quorum. */
  quorum: number;
  /** Number of players allowed to vote. */
  eligible: number;
}

export interface GameState {
  version: number;
  phase: Phase;
  day: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  players: PlayerState[];
  config: GameConfig;
  settings: RoomSettings;
  night: NightState;
  log: LogEntry[];
  winner: Winner;
  winReason: string | null;
  /** Players that won on their own without ending the match (the joker). */
  personalWinners: string[];
  hostId: string;
  startedAt: number;
  lastNight: NightReport | null;
  lastVote: VoteReport | null;
  botMemory: Record<string, BotMemory>;
  nextLogId: number;
  kickVote: KickVote | null;
  /** Timestamp of the last finished kick vote (cooldown). */
  lastKickVoteAt: number;
  nextKickVoteId: number;
  /** Aggregated statistics of the match. */
  stats: MatchStats;
  /** Statistics of every finished round. */
  roundStats: RoundStat[];
}

/** One death, as it happened. */
export interface DeathStat {
  id: string;
  name: string;
  role: Role;
  cause: DeathCause;
  day: number;
}

/** Statistics of one finished round. */
export interface RoundStat {
  day: number;
  deaths: DeathStat[];
  votes: Record<string, number>;
  executedId: string | null;
  tie: boolean;
  abstains: number;
  saved: boolean;
  checks: number;
  messages: number;
}

/** Aggregated statistics of the current match. */
export interface MatchStats {
  rounds: number;
  deathsByCause: Record<DeathCause extends null ? never : Exclude<DeathCause, null>, number>;
  saves: number;
  checks: { mafia: number; maniac: number; clean: number };
  votesCast: number;
  abstains: number;
  executed: number;
  ties: number;
  messages: number;
  kicks: number;
  startedAt: number;
  durationMs: number;
}

export type Action =
  | { type: 'start' }
  | { type: 'advance' }
  | { type: 'ready' }
  | { type: 'lobbyReady'; ready: boolean }
  | { type: 'chat'; text: string }
  | { type: 'vote'; targetId: string | null }
  | { type: 'night'; kind: NightChoiceKind; targetId: string }
  | { type: 'mayorReveal' }
  | { type: 'addBot' }
  | { type: 'removeBot' }
  | { type: 'fillBots'; target: number }
  | { type: 'restart' }
  | { type: 'setName'; name: string }
  | { type: 'updateSettings'; patch: Partial<RoomSettings> }
  | { type: 'setComposition'; composition: RoleComposition }
  | { type: 'resetComposition' }
  | { type: 'setPassword'; hasPassword: boolean }
  | { type: 'kickStart'; targetId: string }
  | { type: 'kickVote'; choice: KickVoteChoice };

export interface ActionOk {
  ok: boolean;
  error?: string;
}

/** Errors are plain codes, translated in the UI. */
export type EngineError =
  | 'err.phase'
  | 'err.host'
  | 'err.players'
  | 'err.full'
  | 'err.role'
  | 'err.target'
  | 'err.self'
  | 'err.dead'
  | 'err.manual'
  | 'err.composition'
  | 'err.notReady'
  | 'err.voteOpen'
  | 'err.voteClosed'
  | 'err.cooldown'
  | 'err.uses'
  | 'err.repeat'
  | 'err.unknown';
