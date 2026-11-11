/**
 * Password handling for the hidden admin panel.
 *
 * The password is never stored in plain text: only a PBKDF2-HMAC-SHA-256
 * digest with a random salt is kept. The comparison runs in constant time.
 */

export interface PasswordDigest {
  algo: 'pbkdf2-sha256';
  iterations: number;
  /** base64 */
  salt: string;
  /** base64 */
  hash: string;
}

export const PBKDF2_ITERATIONS = 600_000;
const KEY_BITS = 256;

const encoder = new TextEncoder();

function toBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new Error('crypto.subtle is not available');
  return api;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** Creates a digest for a password (used to generate the stored value). */
export async function hashPassword(
  password: string,
  salt: Uint8Array = crypto.getRandomValues(new Uint8Array(16)),
  iterations: number = PBKDF2_ITERATIONS,
): Promise<PasswordDigest> {
  const hash = await derive(password, salt, iterations);
  return {
    algo: 'pbkdf2-sha256',
    iterations,
    salt: toBase64(salt),
    hash: toBase64(hash),
  };
}

/** Constant time comparison of two byte arrays. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Checks a password against a stored digest. */
export async function verifyPassword(
  password: string,
  digest: PasswordDigest,
): Promise<boolean> {
  if (!password || digest.algo !== 'pbkdf2-sha256') return false;
  const salt = fromBase64(digest.salt);
  const expected = fromBase64(digest.hash);
  const actual = await derive(password, salt, digest.iterations);
  return timingSafeEqual(actual, expected);
}

/* ------------------------------------------------------------------ lockout */

export interface AttemptState {
  /** Number of failed attempts in a row. */
  failures: number;
  /** Timestamp until which logging in is blocked. */
  lockedUntil: number;
}

export const MAX_ATTEMPTS = 5;

/** The delay after the given number of failures. */
export function lockoutDelay(failures: number): number {
  if (failures <= 0) return 0;
  const ladder = [0, 5_000, 15_000, 60_000, 300_000, 900_000];
  return ladder[Math.min(failures, ladder.length - 1)] ?? 900_000;
}

/** Registers a failed attempt and returns the new state. */
export function registerFailure(state: AttemptState, now: number): AttemptState {
  const failures = state.failures + 1;
  const delay = lockoutDelay(failures);
  return { failures, lockedUntil: failures >= MAX_ATTEMPTS ? now + delay : state.lockedUntil };
}

/** Seconds left of the lockout, 0 when the panel is available. */
export function lockoutSeconds(state: AttemptState, now: number): number {
  return Math.max(0, Math.ceil((state.lockedUntil - now) / 1000));
}

export function isLocked(state: AttemptState, now: number): boolean {
  return state.lockedUntil > now;
}
