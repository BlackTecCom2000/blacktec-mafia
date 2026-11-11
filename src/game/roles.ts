import type {
  CheckResult,
  Faction,
  NightActionKind,
  Role,
  RoleComposition,
  RoleSetMode,
} from './types';

/**
 * Everything the engine, the interface and the room editor need to know about
 * a role. The registry is the single source of truth: the standard decks, the
 * role cards, the editor and the night resolution all read from here.
 */
export interface RoleInfo {
  role: Role;
  faction: Faction;
  /** Base roles are part of the standard decks. */
  base: boolean;
  /** What the role does at night. */
  nightAction: NightActionKind;
  /** What the role does during the day. */
  dayAction: 'none' | 'reveal';
  /** How many times the ability can be used (0 = every night). */
  uses: number;
  /** May the role pick itself? */
  canSelfTarget: boolean;
  /** Who sees the result of the ability. */
  visibility: 'private' | 'team' | 'public';
  /** May there be several copies of the role? */
  stackable: boolean;
}

export const ROLE_INFO: Record<Role, RoleInfo> = {
  mafia: {
    role: 'mafia',
    faction: 'mafia',
    base: true,
    nightAction: 'mafia',
    dayAction: 'none',
    uses: 0,
    canSelfTarget: false,
    visibility: 'team',
    stackable: true,
  },
  doctor: {
    role: 'doctor',
    faction: 'city',
    base: true,
    nightAction: 'heal',
    dayAction: 'none',
    uses: 0,
    canSelfTarget: true,
    visibility: 'private',
    stackable: true,
  },
  detective: {
    role: 'detective',
    faction: 'city',
    base: true,
    nightAction: 'check',
    dayAction: 'none',
    uses: 0,
    canSelfTarget: false,
    visibility: 'private',
    stackable: true,
  },
  citizen: {
    role: 'citizen',
    faction: 'city',
    base: true,
    nightAction: 'none',
    dayAction: 'none',
    uses: 0,
    canSelfTarget: false,
    visibility: 'public',
    stackable: true,
  },
  maniac: {
    role: 'maniac',
    faction: 'maniac',
    base: true,
    nightAction: 'kill',
    dayAction: 'none',
    uses: 0,
    canSelfTarget: false,
    visibility: 'private',
    stackable: true,
  },
  sheriff: {
    role: 'sheriff',
    faction: 'city',
    base: false,
    nightAction: 'checkAny',
    dayAction: 'none',
    uses: 0,
    canSelfTarget: false,
    visibility: 'private',
    stackable: true,
  },
  bodyguard: {
    role: 'bodyguard',
    faction: 'city',
    base: false,
    nightAction: 'guard',
    dayAction: 'none',
    uses: 0,
    canSelfTarget: false,
    visibility: 'private',
    stackable: true,
  },
  avenger: {
    role: 'avenger',
    faction: 'city',
    base: false,
    nightAction: 'shot',
    dayAction: 'none',
    uses: 0,
    canSelfTarget: false,
    visibility: 'public',
    stackable: true,
  },
  mayor: {
    role: 'mayor',
    faction: 'city',
    base: false,
    nightAction: 'none',
    dayAction: 'reveal',
    uses: 0,
    canSelfTarget: false,
    visibility: 'public',
    stackable: true,
  },
  medium: {
    role: 'medium',
    faction: 'city',
    base: false,
    nightAction: 'question',
    dayAction: 'none',
    uses: 0,
    canSelfTarget: false,
    visibility: 'private',
    stackable: true,
  },
  nurse: {
    role: 'nurse',
    faction: 'city',
    base: false,
    nightAction: 'heal',
    dayAction: 'none',
    uses: 0,
    canSelfTarget: true,
    visibility: 'private',
    stackable: true,
  },
  mafiaBoss: {
    role: 'mafiaBoss',
    faction: 'mafia',
    base: false,
    nightAction: 'mafia',
    dayAction: 'none',
    uses: 0,
    canSelfTarget: false,
    visibility: 'team',
    stackable: false,
  },
  blocker: {
    role: 'blocker',
    faction: 'mafia',
    base: false,
    nightAction: 'block',
    dayAction: 'none',
    uses: 0,
    canSelfTarget: false,
    visibility: 'private',
    stackable: true,
  },
  framer: {
    role: 'framer',
    faction: 'mafia',
    base: false,
    nightAction: 'frame',
    dayAction: 'none',
    uses: 0,
    canSelfTarget: false,
    visibility: 'private',
    stackable: true,
  },
  joker: {
    role: 'joker',
    faction: 'city',
    base: false,
    nightAction: 'none',
    dayAction: 'none',
    uses: 0,
    canSelfTarget: false,
    visibility: 'public',
    stackable: true,
  },
};

/** The order the roles are shown in. */
export const ROLE_ORDER: Role[] = [
  'mafia',
  'mafiaBoss',
  'blocker',
  'framer',
  'doctor',
  'nurse',
  'detective',
  'sheriff',
  'bodyguard',
  'avenger',
  'mayor',
  'medium',
  'maniac',
  'joker',
  'citizen',
];

export const BASE_ROLES: Role[] = ROLE_ORDER.filter((role) => ROLE_INFO[role].base);

export const ROLE_FACTION: Record<Role, Faction> = Object.fromEntries(
  (Object.keys(ROLE_INFO) as Role[]).map((role) => [role, ROLE_INFO[role].faction]),
) as Record<Role, Faction>;

/** Roles that act at night. */
export const NIGHT_ROLES: Role[] = ROLE_ORDER.filter((role) => ROLE_INFO[role].nightAction !== 'none');

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
  const composition = {} as RoleComposition;
  for (const role of ROLE_ORDER) composition[role] = 0;
  return composition;
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
  const city = ROLE_ORDER.filter((role) => ROLE_INFO[role].faction === 'city').reduce(
    (sum, role) => sum + Math.max(0, Math.round(composition[role] ?? 0)),
    0,
  );
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

export interface BalanceWarning {
  code: string;
  /** Roles that kill on their own. */
  killers: number;
  city: number;
}

/**
 * Warns about an obviously unbalanced composition. It never blocks the room:
 * the host of a custom room is responsible for the experimental rules.
 */
export function balanceWarnings(composition: RoleComposition): BalanceWarning[] {
  const warnings: BalanceWarning[] = [];
  const killers =
    (composition.mafia ?? 0) +
    (composition.mafiaBoss ?? 0) +
    (composition.maniac ?? 0) +
    (composition.avenger ?? 0);
  const city = ROLE_ORDER.filter((role) => ROLE_INFO[role].faction === 'city').reduce(
    (sum, role) => sum + Math.max(0, Math.round(composition[role] ?? 0)),
    0,
  );
  if (killers > city) {
    warnings.push({ code: 'balance.killers', killers, city });
  }
  if ((composition.joker ?? 0) > 0 && (composition.joker ?? 0) > (composition.citizen ?? 0)) {
    warnings.push({ code: 'balance.joker', killers: composition.joker ?? 0, city });
  }
  return warnings;
}

/** Faction of a role, used by the sheriff to detect any hostile faction. */
export function factionOf(role: Role): Faction {
  return ROLE_INFO[role].faction;
}

/** What an investigator learns about a target. */
export function checkResultFor(targetRole: Role, anyHostile: boolean): CheckResult {
  const faction = ROLE_INFO[targetRole].faction;
  if (faction === 'mafia') return 'mafia';
  if (anyHostile && faction === 'maniac') return 'maniac';
  return 'clean';
}

/** Whether the role set is the standard one. */
export function isStandardSet(mode: RoleSetMode): boolean {
  return mode === 'standard';
}
