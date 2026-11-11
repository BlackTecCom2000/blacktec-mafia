/**
 * Generates the digest that is stored in the repository.
 * Run: node scripts/make-admin-digest.mjs [password]
 * The password itself is never written to the file.
 */
import { webcrypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const password = process.argv[2] ?? 'BlackTecCom2000';
const iterations = 600_000;
const salt = webcrypto.getRandomValues(new Uint8Array(16));

const key = await webcrypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(password),
  'PBKDF2',
  false,
  ['deriveBits'],
);
const bits = await webcrypto.subtle.deriveBits(
  { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
  key,
  256,
);

const toBase64 = (data) => Buffer.from(data).toString('base64');
const digest = {
  algo: 'pbkdf2-sha256',
  iterations,
  salt: toBase64(salt),
  hash: toBase64(new Uint8Array(bits)),
};

const file = `/**
 * The digest of the admin password.
 *
 * The plain password is not part of the source: only this PBKDF2-HMAC-SHA-256
 * digest with a random salt is stored. Change it with
 * \`node scripts/make-admin-digest.mjs "<new password>"\`.
 */

import type { PasswordDigest } from './password';

export const ADMIN_DIGEST: PasswordDigest = ${JSON.stringify(digest, null, 2)};
`;

writeFileSync('src/admin/credentials.ts', file);
console.log('digest written to src/admin/credentials.ts');
console.log('salt:', digest.salt);
console.log('hash:', digest.hash);
