import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

if (process.env.CI !== '1' || process.env.E2E_EPHEMERAL_DATABASE !== '1' || process.env.NODE_ENV !== 'test' || !process.env.GITHUB_ENV) {
  throw new Error('Synthetic CI environment generation requires the disposable CI job.');
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
let bits = '';
for (const byte of randomBytes(20)) bits += byte.toString(2).padStart(8, '0');
const totp = (bits.match(/.{5}/g) || []).map((value) => alphabet[Number.parseInt(value, 2)]).join('');
const values = {
  JWT_ACCESS_SECRET: randomBytes(48).toString('hex'), JWT_REFRESH_SECRET: randomBytes(48).toString('hex'),
  CRYPTO_SECRET: randomBytes(32).toString('hex'), STORAGE_SECRET: randomBytes(32).toString('hex'), E2E_TOTP_SECRET: totp,
  E2E_ADMIN_PASSWORD: 'E2e!' + randomBytes(16).toString('hex'),
  E2E_COLLAB_PASSWORD: 'E2e!' + randomBytes(16).toString('hex'),
  E2E_SUPER_ADMIN_PASSWORD: 'E2e!' + randomBytes(16).toString('hex'),
};
for (const value of Object.values(values)) console.log('::add-mask::' + value);
appendFileSync(process.env.GITHUB_ENV, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
appendFileSync(process.env.GITHUB_ENV, `STORAGE_PATH=${path.resolve('.e2e-runtime/storage')}\n`);
console.log('Generated synthetic credentials for the disposable database only.');
