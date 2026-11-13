import { describe, expect, it } from 'vitest';
import { totp } from '../../../../../e2e/helpers/totp';
import { ephemeralDatabaseUrl, ephemeralStoragePath } from '../../../../../scripts/e2e/ephemeral-database';

const databaseUrl = (host = '127.0.0.1', database = 'omnitech_e2e') => {
  const url = new URL('postgresql://127.0.0.1:5432/omnitech_e2e');
  url.hostname = host;
  url.pathname = database;
  url.username = 'test';
  url.password = 'test';
  return url.toString();
};
const env = { NODE_ENV: 'test', E2E_EPHEMERAL_DATABASE: '1', DATABASE_URL: databaseUrl() };

describe('Disposable E2E bootstrap safety', () => {
  it('requires both explicit flags and an isolated loopback database identity', () => {
    expect(ephemeralDatabaseUrl(env)).toBe(env.DATABASE_URL);
    expect(() => ephemeralDatabaseUrl({ ...env, NODE_ENV: 'production' })).toThrow();
    expect(() => ephemeralDatabaseUrl({ ...env, E2E_EPHEMERAL_DATABASE: undefined })).toThrow();
    expect(() => ephemeralDatabaseUrl({ ...env, DATABASE_URL: databaseUrl('203.0.113.10') })).toThrow();
    expect(() => ephemeralDatabaseUrl({ ...env, DATABASE_URL: databaseUrl('127.0.0.1', 'omnitech') })).toThrow();
    expect(() => ephemeralDatabaseUrl({ ...env, DATABASE_URL: env.DATABASE_URL + '?host=203.0.113.10' })).toThrow();
    expect(() => ephemeralDatabaseUrl({ ...env, DATABASE_URL: env.DATABASE_URL + '?schema=private' })).toThrow();
    expect(() => ephemeralDatabaseUrl({ ...env, DATABASE_URL: env.DATABASE_URL + '?schema=public&schema=private' })).toThrow();
    expect(() => ephemeralDatabaseUrl({ ...env, DATABASE_URL: env.DATABASE_URL.replace('//test:', '//postgres:') })).toThrow();
  });
  it('rejects an invalid URL rather than connecting with defaults', () => {
    expect(() => ephemeralDatabaseUrl({ ...env, DATABASE_URL: 'not-a-url' })).toThrow();
  });
  it('accepts fixture storage only in the isolated checkout tree', () => {
    expect(ephemeralStoragePath('/tmp/checkout', { STORAGE_PATH: '/tmp/checkout/.e2e-runtime/storage' })).toBe('/tmp/checkout/.e2e-runtime/storage');
    expect(() => ephemeralStoragePath('/tmp/checkout', {})).toThrow();
    expect(() => ephemeralStoragePath('/tmp/checkout', { STORAGE_PATH: '/srv/storage' })).toThrow();
    expect(() => ephemeralStoragePath('/tmp/checkout', { STORAGE_PATH: '/tmp/checkout/.e2e-runtime/storage/../other' })).toThrow();
  });
});

describe('Real synthetic MFA codes', () => {
  const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // gitleaks:allow -- Public RFC 6238 test vector, never used as an application credential.
  it('matches SHA1 RFC 6238 vectors truncated to the backend six digits', () => {
    expect(totp(rfcSecret, 59_000)).toBe('287082');
    expect(totp(rfcSecret, 1_111_111_109_000)).toBe('081804');
    expect(totp(rfcSecret, 1_234_567_890_000)).toBe('005924');
  });
  it('accepts standard Base32 padding/spacing and rejects malformed secrets', () => {
    expect(totp(rfcSecret.toLowerCase() + '====', 59_000)).toBe('287082');
    expect(() => totp('not-valid!', 59_000)).toThrow();
  });
});
