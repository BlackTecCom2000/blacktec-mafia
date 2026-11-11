import type { GameState, NightActionKind, PlayerState, Role } from './types';
import { ROLE_INFO } from './roles';
import { pickWeighted } from './rng';
import type { Rng } from './rng';

export const BOT_NAMES = [
  'Вито',
  'Роза',
  'Энцо',
  'Нора',
  'Карло',
  'Ада',
  'Рокко',
  'Вивьен',
  'Сальваторе',
  'Клара',
  'Дино',
  'Мона',
  'Лука',
  'Агнес',
  'Феликс',
  'Марго',
];

export function alivePlayers(state: GameState): PlayerState[] {
  return state.players.filter((player) => player.alive);
}

function suspicionOf(state: GameState, botId: string, targetId: string): number {
  return state.botMemory[botId]?.suspicion[targetId] ?? 0;
}

function candidates(state: GameState, bot: PlayerState): PlayerState[] {
  return alivePlayers(state).filter((player) => player.id !== bot.id);
}

/** The most suspicious candidate, used by most night abilities. */
function mostSuspicious(state: GameState, bot: PlayerState, pool: PlayerState[]): PlayerState | null {
  if (pool.length === 0) return null;
  return pool.reduce((best, player) =>
    suspicionOf(state, bot.id, player.id) > suspicionOf(state, bot.id, best.id) ? player : best,
  );
}

export function chooseMafiaKill(state: GameState, rng: Rng, bot: PlayerState): string | null {
  const pool = candidates(state, bot).filter((player) => ROLE_INFO[player.role].faction !== 'mafia');
  if (pool.length === 0) return null;
  return pickWeighted(
    rng,
    pool.map((player) => ({
      item: player.id,
      weight: 1 + suspicionOf(state, bot.id, player.id) * 1.4,
    })),
  );
}

export function chooseDoctorHeal(state: GameState, rng: Rng, bot: PlayerState): string | null {
  const pool = candidates(state, bot);
  if (pool.length === 0) return null;
  const weighted = pool.map((player) => ({
    item: player.id,
    // Doctors favour saving themselves or the most trusted voice at the table.
    weight: player.id === bot.id ? 2.2 : 1,
  }));
  weighted.push({ item: bot.id, weight: 1.1 });
  return pickWeighted(rng, weighted);
}

export function chooseCheck(state: GameState, rng: Rng, bot: PlayerState): string | null {
  const pool = candidates(state, bot);
  const unchecked = pool.filter((player) => bot.checks[player.id] === undefined);
  const usable = unchecked.length > 0 ? unchecked : pool;
  return pickWeighted(
    rng,
    usable.map((player) => ({
      item: player.id,
      weight: 1 + suspicionOf(state, bot.id, player.id),
    })),
  );
}

export function chooseManiacKill(state: GameState, rng: Rng, bot: PlayerState): string | null {
  const pool = candidates(state, bot);
  if (pool.length === 0) return null;
  return pickWeighted(
    rng,
    pool.map((player) => ({
      item: player.id,
      weight: 1 + suspicionOf(state, bot.id, player.id) * 0.5,
    })),
  );
}

/** The bodyguard protects the most trusted player of the table. */
export function chooseGuard(state: GameState, rng: Rng, bot: PlayerState): string | null {
  const pool = candidates(state, bot);
  if (pool.length === 0) return null;
  const trusted = pool.reduce((best, player) =>
    suspicionOf(state, bot.id, player.id) < suspicionOf(state, bot.id, best.id) ? player : best,
  );
  return rng.next() < 0.6 ? trusted.id : (rng.pick(pool)?.id ?? null);
}

/** The avenger shoots the most suspected player. */
export function chooseShot(state: GameState, rng: Rng, bot: PlayerState): string | null {
  const pool = candidates(state, bot);
  const target = mostSuspicious(state, bot, pool);
  if (!target) return null;
  return rng.next() < 0.8 ? target.id : (rng.pick(pool)?.id ?? null);
}

/** The blocker silences the player the mafia fears the most. */
export function chooseBlock(state: GameState, rng: Rng, bot: PlayerState): string | null {
  const pool = candidates(state, bot).filter(
    (player) => ROLE_INFO[player.role].faction !== 'mafia',
  );
  if (pool.length === 0) return null;
  const target = mostSuspicious(state, bot, pool);
  if (!target) return null;
  return rng.next() < 0.75 ? target.id : (rng.pick(pool)?.id ?? null);
}

/** The framer makes the most suspected investigator look like mafia. */
export function chooseFrame(state: GameState, rng: Rng, bot: PlayerState): string | null {
  const pool = candidates(state, bot).filter(
    (player) => ROLE_INFO[player.role].faction !== 'mafia',
  );
  if (pool.length === 0) return null;
  const target = mostSuspicious(state, bot, pool);
  if (!target) return null;
  return rng.next() < 0.7 ? target.id : (rng.pick(pool)?.id ?? null);
}

/** The medium asks about a dead player. */
export function chooseQuestion(state: GameState, rng: Rng): string | null {
  const dead = state.players.filter((player) => !player.alive);
  if (dead.length === 0) return null;
  return rng.pick(dead)?.id ?? null;
}

export function chooseVote(state: GameState, rng: Rng, bot: PlayerState): string | null {
  const pool = candidates(state, bot);
  if (pool.length === 0) return null;

  if (bot.role === 'detective' || bot.role === 'sheriff') {
    const knownMafia = pool.filter((player) => bot.checks[player.id] === 'mafia');
    if (knownMafia.length > 0) return rng.pick(knownMafia)?.id ?? null;
  }

  const eligible = ROLE_INFO[bot.role].faction === 'mafia'
    ? pool.filter((player) => ROLE_INFO[player.role].faction !== 'mafia')
    : pool;
  const usable = eligible.length > 0 ? eligible : pool;

  const top = usable.reduce(
    (best, player) =>
      suspicionOf(state, bot.id, player.id) > suspicionOf(state, bot.id, best.id) ? player : best,
    usable[0]!,
  );
  const topScore = suspicionOf(state, bot.id, top.id);
  const loud = usable.filter((player) => suspicionOf(state, bot.id, player.id) >= topScore);
  return rng.pick(loud)?.id ?? rng.pick(usable)?.id ?? null;
}

export interface BotChatLine {
  code: string;
  params?: Record<string, string>;
}

const CHAT_LINES = [
  'bot.suspect',
  'bot.accuse',
  'bot.nervous',
  'bot.role',
  'bot.quiet',
  'bot.defend',
];

export function chooseChatLine(
  state: GameState,
  rng: Rng,
  bot: PlayerState,
): BotChatLine | null {
  if (!state.config.botChatter) return null;
  if (rng.next() > 0.72) return null;

  const pool = candidates(state, bot);
  if (pool.length === 0) return null;

  const prime = pool.reduce(
    (best, player) =>
      suspicionOf(state, bot.id, player.id) > suspicionOf(state, bot.id, best.id) ? player : best,
    pool[0]!,
  );
  const named = rng.next() < 0.55 ? prime : (rng.pick(pool) ?? prime);
  const code = rng.pick(CHAT_LINES) ?? 'bot.quiet';
  return { code, params: { name: named.name } };
}

export function suspicionIncrease(state: GameState, botId: string, targetId: string, amount = 2) {
  const memory = state.botMemory[botId];
  if (!memory) return;
  memory.suspicion[targetId] = (memory.suspicion[targetId] ?? 0) + amount;
}

export interface BotNightChoice {
  kind: NightActionKind;
  targetId: string | null;
}

/**
 * The night choice of a bot for the given action kind. Every kind is handled
 * separately, so several copies of a role act independently.
 */
export function botNightChoice(
  state: GameState,
  rng: Rng,
  bot: PlayerState,
  kinds: NightActionKind[] = [],
): BotNightChoice {
  const kind = kinds[0] ?? 'none';
  switch (kind) {
    case 'mafia':
      return { kind, targetId: chooseMafiaKill(state, rng, bot) };
    case 'heal':
      return { kind, targetId: chooseDoctorHeal(state, rng, bot) };
    case 'check':
    case 'checkAny':
      return { kind, targetId: chooseCheck(state, rng, bot) };
    case 'kill':
      return { kind, targetId: chooseManiacKill(state, rng, bot) };
    case 'guard':
      return { kind, targetId: chooseGuard(state, rng, bot) };
    case 'shot':
      return { kind, targetId: chooseShot(state, rng, bot) };
    case 'block':
      return { kind, targetId: chooseBlock(state, rng, bot) };
    case 'frame':
      return { kind, targetId: chooseFrame(state, rng, bot) };
    case 'question':
      return { kind, targetId: chooseQuestion(state, rng) };
    default:
      return { kind: 'none', targetId: null };
  }
}

/** The role of a player (helper for the bots and the tests). */
export function roleOf(player: PlayerState): Role {
  return player.role;
}
