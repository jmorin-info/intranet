import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

const forbidden = new BlockList();
for (const [address, bits] of [['0.0.0.0', 8], ['169.254.0.0', 16], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) forbidden.addSubnet(address, bits, 'ipv4');
for (const [address, bits] of [['::', 128], ['fe80::', 10], ['ff00::', 8]] as const) forbidden.addSubnet(address, bits, 'ipv6');
forbidden.addAddress('fd00:ec2::254', 'ipv6');
const loopback = new BlockList(); loopback.addSubnet('127.0.0.0', 8, 'ipv4'); loopback.addAddress('::1', 'ipv6');
function hostname(url: URL): string { return url.hostname.replace(/^\[|\]$/g, ''); }

/** Return the trusted configuration separately: user input never chooses the wire destination. */
export function trustedDownloadTarget(raw: unknown, allowedBases: readonly string[]): { target: URL; origin: URL } {
  if (typeof raw !== 'string' || !raw || raw.length > 8192 || /[\x00-\x20\x7f\\]/.test(raw)) throw new Error('Invalid document download URL');
  const target = new URL(raw);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.hash) throw new Error('Invalid document download URL');
  for (const configured of allowedBases) {
    let origin: URL;
    try { origin = new URL(configured); } catch { continue; }
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.hash || origin.search || origin.origin !== target.origin) continue;
    const prefix = origin.pathname.replace(/\/$/, '') + '/cache/';
    if (!target.pathname.startsWith(prefix)) continue;
    let decoded = target.pathname;
    for (let round = 0; round < 3; round++) {
      try { decoded = decodeURIComponent(decoded); } catch { throw new Error('Invalid download path encoding'); }
      if (decoded.includes('\\') || decoded.split('/').some((part) => part === '.' || part === '..') || /[\x00-\x1f\x7f]/.test(decoded)) throw new Error('Invalid download path');
    }
    return { target, origin };
  }
  throw new Error('Document download origin or path is not allowed');
}

export function permittedDownloadAddress(address: string, configuredHostname: string): boolean {
  const family = isIP(address);
  if (!family || forbidden.check(address, family === 4 ? 'ipv4' : 'ipv6')) return false;
  if (!loopback.check(address, family === 4 ? 'ipv4' : 'ipv6')) return true;
  const configuredFamily = isIP(configuredHostname);
  // Local Docs Server deployments are explicit configuration, never a public DNS answer.
  return configuredHostname.toLowerCase() === 'localhost' || (!!configuredFamily && loopback.check(configuredHostname, configuredFamily === 4 ? 'ipv4' : 'ipv6'));
}

/** No redirects, no ambient proxy, TLS verification on, one pinned DNS answer, bounded streaming body. */
export async function downloadTrustedBuffer(raw: unknown, allowedBases: readonly string[], options: { timeoutMs?: number; maxBytes?: number } = {}): Promise<Buffer> {
  const { target, origin } = trustedDownloadTarget(raw, allowedBases);
  const configuredHostname = hostname(origin);
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxBytes = options.maxBytes ?? 50 * 1024 * 1024;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 100 * 1024 * 1024) throw new Error('Invalid document download resource limits');
  const deadline = Date.now() + timeoutMs;
  const literal = isIP(configuredHostname);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await Promise.race([
      literal ? Promise.resolve([{ address: configuredHostname, family: literal }]) : lookup(configuredHostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Document download DNS timed out')), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
  if (!addresses.length || addresses.length > 32 || addresses.some((item) => !permittedDownloadAddress(item.address, configuredHostname))) throw new Error('Document download DNS address is not allowed');
  const selected = addresses.find((item) => item.family === 4) ?? addresses[0];
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Document download timed out');
  const pinned = new BlockList(); pinned.addAddress(selected.address, selected.family === 4 ? 'ipv4' : 'ipv6');
  return new Promise<Buffer>((resolve, reject) => {
    let complete = false;
    const chunks: Buffer[] = []; let size = 0;
    const transport = origin.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = transport({
      protocol: origin.protocol, hostname: configuredHostname, port: origin.port || undefined,
      method: 'GET', path: target.pathname + target.search, agent: false,
      family: selected.family,
      lookup: (_name, _options, callback) => callback(null, selected.address, selected.family),
      headers: { Host: origin.host, 'Accept-Encoding': 'identity' },
      // TLS/SNI uses the configured hostname even though its address is pinned.
      ...(origin.protocol === 'https:' ? { servername: configuredHostname, rejectUnauthorized: true } : {}),
    }, (response) => {
      if (response.statusCode !== 200) { fail(new Error(`Document download rejected HTTP ${response.statusCode}`)); response.destroy(); return; }
      const encoding = response.headers['content-encoding'];
      if (encoding && encoding !== 'identity') { fail(new Error('Encoded document response refused')); response.destroy(); return; }
      const length = response.headers['content-length'];
      if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) { fail(new Error('Document download exceeds size limit')); response.destroy(); return; }
      response.on('data', (part: Buffer) => {
        size += part.length;
        if (size > maxBytes) { fail(new Error('Document download exceeds size limit')); response.destroy(); return; }
        chunks.push(Buffer.from(part));
      });
      response.once('aborted', () => fail(new Error('Document download interrupted')));
      response.once('error', () => fail(new Error('Document download body failed')));
      response.once('end', () => {
        if (complete) return;
        complete = true; clearTimeout(requestTimer); resolve(Buffer.concat(chunks, size));
      });
    });
    const requestTimer = setTimeout(() => fail(new Error('Document download timed out')), remaining);
    function fail(error: Error) {
      if (complete) return;
      complete = true; clearTimeout(requestTimer); request.destroy(); reject(error);
    }
    request.once('error', () => fail(new Error('Document download connection failed')));
    request.once('socket', (socket) => socket.once('connect', () => {
      const remote = socket.remoteAddress;
      if (!remote || !pinned.check(remote, isIP(remote) === 4 ? 'ipv4' : 'ipv6')) fail(new Error('Document download connected to an unexpected address'));
    }));
    request.end();
  });
}
