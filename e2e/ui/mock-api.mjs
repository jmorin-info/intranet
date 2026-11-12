import http from 'node:http';

// Server-rendered CMS requests need a real local response. No database,
// outbound request, credential or mail transport exists in this process.
const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:17691');
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (request.method === 'OPTIONS') { response.writeHead(204); return response.end(); }
  if (request.method !== 'GET') { response.writeHead(405); return response.end('{"message":"Fixture en lecture seule."}'); }
  if (request.url?.startsWith('/api/v1/content/blocks')) return response.end('{}');
  if (request.url === '/health') return response.end('{"status":"ok","fixture":true}');
  response.end('[]');
});
server.listen(17692, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
