import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplicationContext } from '@nestjs/common';
import { ServerOptions } from 'socket.io';

/**
 * Custom Socket.IO adapter qui monte socket.io sur /api/socket.io/
 * au lieu du /socket.io/ par défaut.
 *
 * Raison : le reverse proxy frontal (BunkerWeb / nginx externe) ne route
 * vers le backend NestJS que le préfixe /api/*. Le chemin /socket.io/
 * tombe sur le frontend Next.js qui retourne 400. En plaçant socket.io
 * sous /api/socket.io/, le upgrade WebSocket passe bien par le proxy
 * vers le backend (3000).
 *
 * Côté client : io(url, { path: '/api/socket.io' }).
 *
 * Refs: fix Mission P1.9.M3 bug wss:// 400.
 */
export class ApiSocketIoAdapter extends IoAdapter {
  constructor(app: INestApplicationContext) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    return super.createIOServer(port, {
      ...options,
      path: '/api/socket.io',
    });
  }
}
