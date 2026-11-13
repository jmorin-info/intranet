import path from 'node:path';

/** Guards the destructive test bootstrap; never accepts a production/preproduction database. */
export function ephemeralDatabaseUrl(env: Readonly<Record<string, string | undefined>> = process.env): string {
  if (env.E2E_EPHEMERAL_DATABASE !== '1' || env.NODE_ENV !== 'test') {
    throw new Error('[e2e] Bootstrap requires NODE_ENV=test and E2E_EPHEMERAL_DATABASE=1.');
  }
  if (!env.DATABASE_URL) throw new Error('[e2e] DATABASE_URL is required.');
  const url = new URL(env.DATABASE_URL);
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
      || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || !/^\/omnitech_e2e(?:_[a-zA-Z0-9_]+)?$/.test(url.pathname)
      || !['e2e', 'test'].includes(decodeURIComponent(url.username))
      || [...url.searchParams.keys()].some((key) => key !== 'schema')
      || url.searchParams.getAll('schema').length > 1
      || (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')) {
    throw new Error('[e2e] Bootstrap accepts only a loopback PostgreSQL database named omnitech_e2e[_...], with a dedicated e2e/test role and public schema.');
  }
  return url.toString();
}

/** Bootstrap may create files only inside this checkout's dedicated fixture tree. */
export function ephemeralStoragePath(root: string, env: Readonly<Record<string, string | undefined>> = process.env): string {
  const expected = path.resolve(root, '.e2e-runtime/storage');
  if (!env.STORAGE_PATH || path.resolve(env.STORAGE_PATH) !== expected) {
    throw new Error('[e2e] STORAGE_PATH must be this checkout\'s .e2e-runtime/storage.');
  }
  return expected;
}
