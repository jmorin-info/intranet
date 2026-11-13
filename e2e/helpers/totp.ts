import { createHmac } from 'node:crypto';

/** RFC 6238 TOTP for explicit synthetic fixtures; the backend still verifies it. */
export function totp(secret: string, now = Date.now()): string {
  const clean = secret.toUpperCase().replace(/[\s=]/g, '');
  if (!/^[A-Z2-7]{16,}$/.test(clean)) throw new Error('[e2e] Invalid explicit test TOTP secret.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of clean) bits += alphabet.indexOf(character).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) || []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

export function testMfaCode(role: 'ADMIN' | 'COLLAB' | 'SUPER_ADMIN'): string | undefined {
  const secret = process.env[`E2E_${role}_TOTP_SECRET`] || process.env.E2E_TOTP_SECRET;
  return secret ? totp(secret) : undefined;
}

/** Avoid starting a bcrypt/network round-trip at the last instant of an OTP. */
export async function waitForTotpWindow(): Promise<void> {
  const remaining = 30_000 - (Date.now() % 30_000);
  if (remaining < 3_000) await new Promise((resolve) => setTimeout(resolve, remaining + 50));
}
