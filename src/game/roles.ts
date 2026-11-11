import type { CheckResult, Faction, Role, RoleComposition } from './types';

export const ROLE_ORDER: Role[] = ['mafia', 'doctor', 'detective', 'sheriff', 'maniac', 'citizen'];

export const ROLE_FACTION: Record<Role, Faction> = {
  mafia: 'mafia',
  doctor: 'city',
  detective: 'city',
  sheriff: 'city',
  maniac: 'maniac',
  citizen: 'city',
};

/** Roles that act at night. */
export const NIGHT_ROLES: Role[] = ['mafia', 'doctor', 'detective', 'sheriff', 'maniac'];

const DECKS: Record<number, Array<[Role, number]>> = {
  6: [
    ['mafia', 2],
    ['doctor', 1],
    ['detective', 1],
    ['citizen', 2],
  ],
  7: [
    ['mafia', 2],
    ['doctor', 1],
    ['detective', 1],
    ['citizen', 3],
  ],
  8: [
    ['mafia', 2],
    ['doctor', 1],
    ['detective', 1],
    ['maniac', 1],
    ['citizen', 3],
  ],
  9: [
    ['mafia', 3],
    ['doctor', 1],
    ['detective', 1],
    ['maniac', 1],
    ['citizen', 3],
  ],
  10: [
    ['mafia', 3],
    ['doctor', 1],
    ['detective', 1],
    ['maniac', 1],
    ['citizen', 4],
  ],
  11: [
    ['mafia', 3],
    ['doctor', 1],
    ['detective', 1],
    ['maniac', 1],
    ['citizen', 5],
  ],
  12: [
    ['mafia', 4],
    ['doctor', 1],
    ['detective', 1],
    ['maniac', 1],
    ['citizen', 5],
  ],
};

/** Deterministic role composition for a table of `count` players. */
export function roleDeck(count: number): Role[] {
  const clamped = Math.max(6, Math.min(12, Math.round(count)));
  const deck = DECKS[clamped] ?? DECKS[6]!;
  const roles: Role[] = [];
  for (const [role, amount] of deck) {
    for (let i = 0; i < amount; i += 1) roles.push(role);
  }
  return roles;
}

export function roleCounts(count: number): Partial<Record<Role, number>> {
  const counts: Partial<Record<Role, number>> = {};
  for (const role of roleDeck(count)) {
    counts[role] = (counts[role] ?? 0) + 1;
  }
  return counts;
}

/** Counts of an arbitrary composition. */
export function compositionCounts(
  composition: RoleComposition,
): Partial<Record<Role, number>> {
  const counts: Partial<Record<Role, number>> = {};
  for (const role of ROLE_ORDER) {
    const amount = Math.max(0, Math.round(composition[role] ?? 0));
    if (amount > 0) counts[role] = amount;
  }
  return counts;
}

export function mafiaCount(count: number): number {
  return roleDeck(count).filter((role) => role === 'mafia').length;
}

export function hasManiac(count: number): boolean {
  return count >= 8;
}

export function emptyComposition(): RoleComposition {
  return { mafia: 0, doctor: 0, detective: 0, sheriff: 0, maniac: 0, citizen: 0 };
}

/** Turns a composition into a flat list of roles. */
export function compositionToRoles(composition: RoleComposition): Role[] {
  const roles: Role[] = [];
  for (const role of ROLE_ORDER) {
    const amount = Math.max(0, Math.round(composition[role] ?? 0));
    for (let i = 0; i < amount; i += 1) roles.push(role);
  }
  return roles;
}

export function compositionTotal(composition: RoleComposition): number {
  return ROLE_ORDER.reduce((sum, role) => sum + Math.max(0, Math.round(composition[role] ?? 0)), 0);
}

export function normalizeComposition(composition: RoleComposition): RoleComposition {
  const clean = emptyComposition();
  for (const role of ROLE_ORDER) {
    clean[role] = Math.max(0, Math.round(composition[role] ?? 0));
  }
  return clean;
}

/** A composition is playable when it has roles and at least one city-side player. */
export function isCompositionSane(composition: RoleComposition): boolean {
  const total = compositionTotal(composition);
  if (total < 2) return false;
  const city = composition.doctor + composition.detective + composition.sheriff + composition.citizen;
  if (city === 0) return false;
  return true;
}

/** Standard composition for the given table size. */
export function standardComposition(count: number): RoleComposition {
  const composition = emptyComposition();
  for (const role of roleDeck(count)) {
    composition[role] += 1;
  }
  return composition;
}

/** Faction of a role, used by the sheriff to detect any hostile faction. */
export function factionOf(role: Role): Faction {
  return ROLE_FACTION[role];
}

/** What an investigator learns about a target. */
export function checkResultFor(targetRole: Role, sheriff: boolean): CheckResult {
  const faction = ROLE_FACTION[targetRole];
  if (faction === 'mafia') return 'mafia';
  if (sheriff && faction === 'maniac') return 'maniac';
  return 'clean';
}
