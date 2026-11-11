/** Core domain types for the BlackTec Mafia engine. */

export type Role = 'mafia' | 'doctor' | 'detective' | 'sheriff' | 'maniac' | 'citizen';

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

export type Winner = 'mafia' | 'city' | 'maniac' | null;

export type DeathCause = 'mafia' | 'maniac' | 'vote' | null;

export const MIN_PLAYERS = 6;
export const MAX_PLAYERS = 12;
/** Hard technical limit for custom rooms (no artificial 12-player cap). */
export const TECHNICAL_MAX_PLAYERS = 24;

/** Number of roles per table for the standard decks. */
export interface RoleComposition {
  mafia: number;
  doctor: number;
  detective: number;
  sheriff: number;
  maniac: number;
  citizen: number;
}

export type RoleSetMode = 'standard' | 'custom';

/**
 * `alone`  — the maniac wins only when it is the last living player.
 * `faction` — the maniacs win when every living player is a maniac.
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
  composition: { mafia: 2, doctor: 1, detective: 1, sheriff: 0, maniac: 1, citizen: 3 },
  allowIncomplete: false,
  maniacWinRule: 'alone',
  voiceEnabled: true,
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
  /** Detective / sheriff knowledge: target id -> result. */
  checks: Record<string, CheckResult>;
}

export interface NightState {
  /** Every mafia member votes separately: player id -> target id. */
  mafiaVotes: Record<string, string>;
  /** Every doctor picks their own patient. */
  doctorTargets: Record<string, string>;
  detectiveTargets: Record<string, string>;
  sheriffTargets: Record<string, string>;
  /** Every maniac picks their own victim. */
  maniacTargets: Record<string, string>;
  /** True once every required night action has been submitted. */
  locked: boolean;
  /** When the choices were locked (grace window start). */
  lockedAt: number | null;
}

export interface NightReport {
  day: number;
  deaths: Array<{ id: string; role: Role }>;
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
}

export type Action =
  | { type: 'start' }
  | { type: 'advance' }
  | { type: 'ready' }
  | { type: 'lobbyReady'; ready: boolean }
  | { type: 'chat'; text: string }
  | { type: 'vote'; targetId: string | null }
  | { type: 'kill'; targetId: string }
  | { type: 'heal'; targetId: string }
  | { type: 'investigate'; targetId: string }
  | { type: 'sheriffCheck'; targetId: string }
  | { type: 'maniacKill'; targetId: string }
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
  | 'err.unknown';
