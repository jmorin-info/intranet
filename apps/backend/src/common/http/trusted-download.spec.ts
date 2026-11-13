const dns: typeof import('node:dns/promises') = require('node:dns/promises');
import * as http from 'node:http';
import * as https from 'node:https';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Duplex } from 'node:stream';
import { downloadTrustedBuffer, permittedDownloadAddress, trustedDownloadTarget } from './trusted-download';

async function server(handler: http.RequestListener, operation: (base: string) => Promise<void>) {
  const listener = http.createServer(handler); const sockets = new Set<Duplex>();
  listener.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const base = `http://localhost:${(listener.address() as { port: number }).port}`;
  try { await operation(base); } finally { for (const socket of sockets) socket.destroy(); await new Promise<void>((resolve) => listener.close(() => resolve())); }
}
describe('Trusted document download boundary', () => {
  afterEach(() => jest.restoreAllMocks());
  it('uses the configured origin, keeps signed query strings and bounds a real streamed response', async () => {
    await server((req, res) => { expect(req.url).toBe('/cache/files/document.docx?signature=opaque'); expect(req.headers.host).toMatch(/^localhost:/); res.end('canonical document'); }, async (base) => {
      const result = await downloadTrustedBuffer(`${base}/cache/files/document.docx?signature=opaque`, [base]);
      expect(result.toString()).toBe('canonical document');
    });
  });
  it('refuses scheme downgrade, origin/port changes, credentials, fragments, traversal and non-scalar values', () => {
    const bases = ['https://docs.example.invalid'];
    for (const raw of [undefined, ['https://docs.example.invalid/cache/f.docx'], { toString: () => 'https://docs.example.invalid/cache/f.docx' }, 'http://docs.example.invalid/cache/f.docx', 'https://docs.example.invalid:444/cache/f.docx', 'https://evil.example/cache/f.docx', 'https://docs.example.invalid/cache/f.docx#fragment', 'https://docs.example.invalid/admin', 'https://docs.example.invalid/cache/%252e%252e/admin', 'https://docs.example.invalid/cache/%5cadmin']) expect(() => trustedDownloadTarget(raw, bases)).toThrow();
    const withCredentials = new URL('https://docs.example.invalid/cache/f.docx'); withCredentials.username = 'fixture'; withCredentials.password = 'fixture';
    expect(() => trustedDownloadTarget(withCredentials.href, bases)).toThrow();
  });
  it('never follows a same-origin redirect into another host or endpoint', async () => {
    let leaked = 0;
    await server((_req, res) => { leaked++; res.end('not permitted'); }, async (trap) => {
      await server((_req, res) => { res.writeHead(302, { Location: `${trap}/cache/secret` }); res.end(); }, async (base) => {
        // Reproduce the previous fetch behavior locally, then prove the guarded transport closes it.
        expect(await (await fetch(`${base}/cache/files/a`)).text()).toBe('not permitted'); expect(leaked).toBe(1); leaked = 0;
        await expect(downloadTrustedBuffer(`${base}/cache/files/a`, [base])).rejects.toThrow('302');
      });
    });
    expect(leaked).toBe(0);
  });
  it('pins one DNS resolution and does not perform a second attacker-controlled lookup', async () => {
    await server((_req, res) => res.end('pinned'), async (base) => {
      const lookup = jest.spyOn(dns, 'lookup').mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as any).mockRejectedValue(new Error('second lookup forbidden'));
      await expect(downloadTrustedBuffer(`${base}/cache/files/a`, [base])).resolves.toEqual(Buffer.from('pinned'));
      expect(lookup).toHaveBeenCalledTimes(1);
    });
  });
  it('rejects metadata/link-local/unspecified addresses and public-host rebinding to loopback', async () => {
    for (const address of ['0.0.0.0', '169.254.169.254', '::ffff:169.254.169.254', 'fe80::1', '::', 'ff02::1', 'fd00:ec2::254', '127.0.0.1', '::ffff:7f00:1', '::1']) expect(permittedDownloadAddress(address, 'docs.example.invalid')).toBe(false);
    expect(permittedDownloadAddress('127.0.0.1', 'localhost')).toBe(true);
    expect(permittedDownloadAddress('10.33.120.55', 'configured.internal')).toBe(true);
    jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as any);
    await expect(downloadTrustedBuffer('http://docs.example.invalid/cache/files/a', ['http://docs.example.invalid'])).rejects.toThrow('DNS address');
  });
  it('rejects oversized declared and chunked responses without keeping a partial body', async () => {
    await server((_req, res) => { res.writeHead(200, { 'Content-Length': '100' }); res.end('small'); }, async (base) => {
      await expect(downloadTrustedBuffer(`${base}/cache/files/a`, [base], { maxBytes: 8 })).rejects.toThrow('size limit');
    });
    await server((_req, res) => { res.write('12345'); res.end('67890'); }, async (base) => {
      await expect(downloadTrustedBuffer(`${base}/cache/files/a`, [base], { maxBytes: 8 })).rejects.toThrow('size limit');
    });
  });
  it('keeps TLS certificate verification enabled for the pinned configured hostname', async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'office-tls-fixture-'));
    const key = path.join(temporary, 'server.key'); const cert = path.join(temporary, 'server.crt');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-days', '1'], { stdio: 'ignore' });
    let received = 0; const sockets = new Set<Duplex>();
    const listener = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (_req, res) => { received++; res.end('untrusted TLS'); });
    listener.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
    listener.on('tlsClientError', () => {});
    try {
      await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
      const base = `https://localhost:${(listener.address() as { port: number }).port}`;
      await expect(downloadTrustedBuffer(`${base}/cache/files/a`, [base])).rejects.toThrow('connection failed');
      expect(received).toBe(0);
    } finally { for (const socket of sockets) socket.destroy(); await new Promise<void>((resolve) => listener.close(() => resolve())); fs.rmSync(temporary, { recursive: true, force: true }); }
  });
  it('enforces a total deadline and rejects invalid resource budgets before network activity', async () => {
    await server(() => {}, async (base) => {
      await expect(downloadTrustedBuffer(`${base}/cache/files/a`, [base], { timeoutMs: 40 })).rejects.toThrow('timed out');
      await expect(downloadTrustedBuffer(`${base}/cache/files/a`, [base], { maxBytes: NaN })).rejects.toThrow('resource limits');
    });
  });
});
