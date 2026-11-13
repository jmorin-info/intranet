import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumLifetime = 7 * 24 * 60 * 60 * 1000;

function signingKey(refreshSecret: string): Buffer {
  // Domain-separated key: this capability can never authenticate an API JWT.
  return createHmac('sha256', refreshSecret).update('omnitech/session-refresh-revocation/key/v1').digest();
}

export function createSessionRefreshToken(sessionId: string, refreshSecret: string, now = Date.now()): string {
  if (!uuid.test(sessionId)) throw new Error('Invalid session identifier');
  const unsigned = `sr1.${sessionId}.${randomUUID()}.${now + maximumLifetime}`;
  return `${unsigned}.${createHmac('sha256', signingKey(refreshSecret)).update(unsigned).digest('hex')}`;
}

/** Only grants revocation of its own session, never refresh or access on its own. */
export function sessionRevocationId(token: unknown, refreshSecret: string, now = Date.now()): string | null {
  if (typeof token !== 'string' || token.length > 256) return null;
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== 'sr1' || !uuid.test(parts[1]) || !uuid.test(parts[2]) || !/^\d{13}$/.test(parts[3]) || !/^[a-f0-9]{64}$/.test(parts[4])) return null;
  const expiresAt = Number(parts[3]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + maximumLifetime) return null;
  const unsigned = parts.slice(0, 4).join('.');
  const expected = createHmac('sha256', signingKey(refreshSecret)).update(unsigned).digest();
  return timingSafeEqual(expected, Buffer.from(parts[4], 'hex')) ? parts[1] : null;
}
