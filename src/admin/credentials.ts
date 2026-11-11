/**
 * The digest of the admin password.
 *
 * The plain password is not part of the source: only this PBKDF2-HMAC-SHA-256
 * digest with a random salt is stored. Change it with
 * `node scripts/make-admin-digest.mjs "<new password>"`.
 */

import type { PasswordDigest } from './password';

export const ADMIN_DIGEST: PasswordDigest = {
  "algo": "pbkdf2-sha256",
  "iterations": 600000,
  "salt": "SHqqtp/ByTO4MYhJ6IwXog==",
  "hash": "4qZYB/JrhrWcEryRdY+d4bENRCmzWtWFDP4p8nyLtSY="
};
