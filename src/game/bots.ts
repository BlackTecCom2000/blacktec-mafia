import type { GameState, PlayerState, Role } from './types';
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

export function chooseMafiaKill(state: GameState, rng: Rng, bot: PlayerState): string | null {
  const pool = candidates(state, bot).filter((player) => player.role !== 'mafia');
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

export function chooseDetectiveCheck(state: GameState, rng: Rng, bot: PlayerState): string | null {
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

export function chooseVote(state: GameState, rng: Rng, bot: PlayerState): string | null {
  const pool = candidates(state, bot);
  if (pool.length === 0) return null;

  if (bot.role === 'detective' || bot.role === 'sheriff') {
    const knownMafia = pool.filter((player) => bot.checks[player.id] === 'mafia');
    if (knownMafia.length > 0) return rng.pick(knownMafia)?.id ?? null;
  }

  const eligible = bot.role === 'mafia' ? pool.filter((player) => player.role !== 'mafia') : pool;
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

export function botNightChoice(
  state: GameState,
  rng: Rng,
  bot: PlayerState,
): { role: Role; targetId: string | null } {
  switch (bot.role) {
    case 'mafia':
      return { role: bot.role, targetId: chooseMafiaKill(state, rng, bot) };
    case 'doctor':
      return { role: bot.role, targetId: chooseDoctorHeal(state, rng, bot) };
    case 'detective':
    case 'sheriff':
      return { role: bot.role, targetId: chooseDetectiveCheck(state, rng, bot) };
    case 'maniac':
      return { role: bot.role, targetId: chooseManiacKill(state, rng, bot) };
    default:
      return { role: bot.role, targetId: null };
  }
}
