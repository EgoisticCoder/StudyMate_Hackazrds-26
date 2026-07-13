import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js';

const PBKDF2_ITERATIONS = 120_000;
const KEY_LENGTH = 32;

export async function hashPassword(
  password: string
): Promise<{ saltHex: string; hashHex: string }> {
  const salt = randomBytes(16);
  const derived = await pbkdf2Async(sha256, password, salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: KEY_LENGTH,
  });
  return { saltHex: bytesToHex(salt), hashHex: bytesToHex(derived) };
}

export async function verifyPassword(
  password: string,
  saltHex: string,
  hashHex: string
): Promise<boolean> {
  const salt = hexToBytes(saltHex);
  const derived = await pbkdf2Async(sha256, password, salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: KEY_LENGTH,
  });
  return bytesToHex(derived) === hashHex;
}
