import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertTestEnvironment, assertTestUrl } from '../../../../../e2e/helpers/test-environment';

describe('E2E production guard', () => {
  it('rejects all production aliases, any port, trailing dots, subdomains and canonical IPv4 aliases', () => {
    for (const url of ['http://10.33.120.55:3001', 'https://BX-IT-INTRANET-VM.OMNITECH.SECURITY.:8443',
      'https://intranet.omnitech-security.fr', 'https://api.intranet.omnitech-security.fr', 'http://0x0a217837', 'http://[::ffff:10.33.120.55]']) {
      expect(() => assertTestUrl(url, 'test')).toThrow();
    }
  });
  it('accepts isolated targets and refuses credentials or ambiguous protocols', () => {
    expect(assertTestUrl('http://localhost:3001', 'test')).toBe('http://localhost:3001');
    expect(assertTestUrl('https://intranet-preprod.example.test', 'test')).toContain('example.test');
    for (const url of ['javascript:alert(1)', '/api', 'https://user:secret@localhost']) {
      expect(() => assertTestUrl(url, 'test')).toThrow();
    }
  });
  it('checks the API even when the front end is local', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omnitech-e2e-'));
    try {
      for (const key of ['API_BASE_URL', 'E2E_API_URL', 'E2E_API_BASE_URL', 'NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_WS_URL']) {
        expect(() => assertTestEnvironment({ BASE_URL: 'http://localhost:3001', [key]: 'https://intranet.omnitech-security.fr/api/v1' }, root)).toThrow();
      }
      fs.mkdirSync(path.join(root, 'apps/frontend'), { recursive: true });
      fs.writeFileSync(path.join(root, 'apps/frontend/.env.production'), 'NEXT_PUBLIC_API_URL="https://intranet.omnitech-security.fr/api/v1"\n');
      expect(() => assertTestEnvironment({ BASE_URL: 'http://localhost:3001' }, root)).toThrow();
    } finally { fs.rmSync(root, { recursive: true }); }
  });
});
