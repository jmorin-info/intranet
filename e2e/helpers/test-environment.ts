import fs from 'node:fs';
import path from 'node:path';

const PRODUCTION_HOSTS = new Set([
  '10.33.120.55',
  '[::ffff:a21:7837]',
  'bx-it-intranet-vm.omnitech.security',
  'intranet.omnitech-security.fr',
]);
const URL_KEYS = ['BASE_URL', 'API_BASE_URL', 'E2E_API_URL', 'E2E_API_BASE_URL',
  'NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_WS_URL', 'NEXT_PUBLIC_CDN_URL'] as const;

/** Fail before a browser, an API login or a destructive fixture can start. */
export function assertTestUrl(value: string, label: string): string {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error(`[e2e] ${label} doit être une URL absolue de test.`); }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`[e2e] ${label} : protocole ou identifiants intégrés interdits.`);
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (PRODUCTION_HOSTS.has(host) || [...PRODUCTION_HOSTS].some((production) => host.endsWith(`.${production}`))) {
    throw new Error(`[e2e] ${label} désigne la production OMNITECH. Utilisez une instance locale ou une préproduction isolée.`);
  }
  return url.toString().replace(/\/$/, '');
}

export function assertTestEnvironment(env: Readonly<Record<string, string | undefined>> = process.env, root = path.resolve(__dirname, '../..')): void {
  for (const key of URL_KEYS) if (env[key]) assertTestUrl(env[key]!, key);
  // Next inlines public variables into client bundles. A localhost front end
  // can otherwise silently call the production API via an ignored .env file.
  for (const dir of [root, path.join(root, 'apps/frontend')]) {
    for (const filename of ['.env', '.env.local', '.env.development', '.env.development.local', '.env.production', '.env.production.local', '.env.test', '.env.test.local']) {
      const file = path.join(dir, filename);
      if (!fs.existsSync(file)) continue;
      const contents = fs.readFileSync(file, 'utf8');
      for (const line of contents.split(/\r?\n/)) {
        const match = line.match(/^\s*(?:export\s+)?(NEXT_PUBLIC_(?:API|WS|CDN)_URL)\s*=\s*(.*?)\s*$/);
        if (!match || !match[2]) continue;
        const raw = match[2];
        const value = raw[0] === '"' || raw[0] === "'"
          ? raw.slice(1, raw.indexOf(raw[0], 1) === -1 ? undefined : raw.indexOf(raw[0], 1))
          : raw.split(/\s+#/)[0]!.trim();
        if (value.includes('$')) throw new Error(`[e2e] ${filename} : URL publique interpolée ; fournissez une configuration locale explicite.`);
        if (value) assertTestUrl(value, `${filename}:${match[1]}`);
      }
    }
  }
}

export function testBaseUrl(): string {
  return assertTestUrl(process.env.BASE_URL || 'http://localhost:3001', 'BASE_URL');
}

export function testApiUrl(): string {
  return assertTestUrl(process.env.E2E_API_URL || process.env.E2E_API_BASE_URL || process.env.API_BASE_URL || 'http://localhost:3000/api/v1', 'E2E_API_URL');
}

export function requireTestCredentials(role: 'ADMIN' | 'COLLAB' | 'SUPER_ADMIN' = 'ADMIN'): { email: string; password: string } {
  const email = process.env[`E2E_${role}_EMAIL`];
  const password = process.env[`E2E_${role}_PASSWORD`];
  if (!email || !password) throw new Error(`[e2e] Définissez E2E_${role}_EMAIL et E2E_${role}_PASSWORD pour un compte de test dédié.`);
  return { email, password };
}
