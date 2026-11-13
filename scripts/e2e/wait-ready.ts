import fs from 'node:fs';
import { assertTestEnvironment, assertTestUrl } from '../../e2e/helpers/test-environment';

async function main() {
  assertTestEnvironment();
  const [kind, rawUrl, rawTimeout = '120000', pidFile] = process.argv.slice(2);
  if (!['backend', 'frontend'].includes(kind || '') || !rawUrl) throw new Error('Usage: wait-ready.ts backend|frontend URL [timeoutMs] [pidFile]');
  const url = assertTestUrl(rawUrl, 'readiness URL');
  const timeout = Number(rawTimeout);
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 600000) throw new Error('[e2e] Invalid readiness timeout.');
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (pidFile) {
      const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
      if (!Number.isInteger(pid) || pid < 1) throw new Error('[e2e] Invalid server PID.');
      try { process.kill(pid, 0); } catch { throw new Error(`[e2e] ${kind} process exited before readiness.`); }
    }
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        if (kind === 'backend') {
          const body = await response.json() as { service?: string; status?: string };
          if (body.service === 'db' && body.status === 'up') { console.log('[e2e] Backend and disposable database ready.'); return; }
        } else {
          const html = await response.text();
          if (html.includes('/_next/') && /<html[\s>]/i.test(html)) { console.log('[e2e] Frontend Next.js ready.'); return; }
        }
      }
    } catch { /* bounded retry; never declares an unready service successful */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`[e2e] ${kind} readiness timeout after ${timeout}ms.`);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : '[e2e] Readiness failed.'); process.exitCode = 1; });
