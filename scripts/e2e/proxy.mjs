/** Same-origin test edge. Streams to the real servers without mocking authentication or responses. */
import http from 'node:http';

if (process.env.E2E_EPHEMERAL_DATABASE !== '1' || process.env.NODE_ENV !== 'test') {
  throw new Error('E2E proxy requires the explicit disposable test environment.');
}
function loopback(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !url.port) {
    throw new Error(`${label} must be an explicit HTTP loopback origin with a port.`);
  }
  return url;
}
const frontend = loopback(process.env.E2E_FRONTEND_INTERNAL_URL, 'E2E_FRONTEND_INTERNAL_URL');
const backend = loopback(process.env.E2E_BACKEND_INTERNAL_URL, 'E2E_BACKEND_INTERNAL_URL');
const publicOrigin = loopback(process.env.BASE_URL, 'BASE_URL');
if (new Set([frontend.origin, backend.origin, publicOrigin.origin]).size !== 3) throw new Error('E2E proxy and upstream origins must differ.');
function targetFor(rawPath = '/') {
  if (!rawPath.startsWith('/') || rawPath.startsWith('//')) throw new Error('Absolute proxy targets are refused.');
  return rawPath.startsWith('/api/') && !rawPath.startsWith('/api/cms/revalidate') ? backend : frontend;
}
function forwardedHeaders(request) {
  return { ...request.headers, 'x-forwarded-for': request.socket.remoteAddress || '127.0.0.1',
    'x-forwarded-host': request.headers.host || publicOrigin.host, 'x-forwarded-proto': 'http' };
}
const hostname = (url) => url.hostname.replace(/^\[|\]$/g, '');
const server = http.createServer((request, response) => {
  let target;
  try { target = targetFor(request.url); } catch { response.writeHead(400); return response.end('Invalid test proxy path.'); }
  const upstream = http.request({ hostname: hostname(target), port: target.port, method: request.method,
    path: request.url, headers: forwardedHeaders(request) }, (incoming) => {
    response.writeHead(incoming.statusCode || 502, incoming.headers);
    incoming.pipe(response);
    incoming.on('error', () => response.destroy());
  });
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'application/json' });
    response.end('{"message":"E2E upstream unavailable."}');
  });
  request.on('aborted', () => upstream.destroy());
  request.pipe(upstream);
});
server.on('upgrade', (request, socket, head) => {
  if (!request.url?.startsWith('/api/socket.io')) return socket.destroy();
  const upstream = http.request({ hostname: hostname(backend), port: backend.port,
    path: request.url, method: request.method, headers: forwardedHeaders(request) });
  upstream.on('upgrade', (incoming, targetSocket, targetHead) => {
    socket.write(`HTTP/1.1 ${incoming.statusCode} ${incoming.statusMessage}\r\n`);
    for (let index = 0; index < incoming.rawHeaders.length; index += 2) socket.write(`${incoming.rawHeaders[index]}: ${incoming.rawHeaders[index + 1]}\r\n`);
    socket.write('\r\n');
    if (targetHead.length) socket.write(targetHead);
    if (head.length) targetSocket.write(head);
    socket.pipe(targetSocket).pipe(socket);
    socket.on('error', () => targetSocket.destroy());
    targetSocket.on('error', () => socket.destroy());
  });
  upstream.on('response', () => socket.destroy());
  upstream.on('error', () => socket.destroy());
  upstream.end();
});
server.listen(Number(publicOrigin.port), hostname(publicOrigin), () => console.log('[e2e] Same-origin proxy ready.'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
