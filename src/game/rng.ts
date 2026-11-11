/** Small deterministic RNG (mulberry32). Same seed -> same game. */
export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T | null;
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(maxExclusive) {
      if (maxExclusive <= 0) return 0;
      return Math.floor(next() * maxExclusive);
    },
    pick(items) {
      if (items.length === 0) return null;
      return items[Math.floor(next() * items.length)] ?? null;
    },
    shuffle(items) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const a0 = copy[i]!;
        const b0 = copy[j]!;
        copy[i] = b0;
        copy[j] = a0;
      }
      return copy;
    },
  };
}

export function pickWeighted<T>(
  rng: Rng,
  items: ReadonlyArray<{ item: T; weight: number }>,
): T | null {
  const usable = items.filter((entry) => entry.weight > 0);
  if (usable.length === 0) return null;
  const total = usable.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng.next() * total;
  for (const entry of usable) {
    roll -= entry.weight;
    if (roll <= 0) return entry.item;
  }
  return usable[usable.length - 1]!.item;
}

export function randomCode(length = 5): string {
  // No 0/O/1/I/L to keep codes readable over voice chat.
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[(bytes[i] ?? 0) % alphabet.length];
  return out;
}
