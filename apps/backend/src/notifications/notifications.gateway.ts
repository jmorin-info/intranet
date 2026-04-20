import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NotificationsService } from './notifications.service';

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
      : ['http://localhost:5173'],
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
    this.notificationsService.setGateway(this);
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn('Client connected without token, disconnecting');
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret:
          process.env.JWT_ACCESS_SECRET || 'omnitech-access-secret-change-me',
      });

      const userId = payload.sub;
      client.data.userId = userId;

      // Join user-specific room
      await client.join(userId);

      this.logger.log(`Client connected: ${userId}`);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(`Authentication failed: ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (userId) {
      this.logger.log(`Client disconnected: ${userId}`);
    }
  }

  sendToUser(userId: string, notification: any) {
    this.server.to(userId).emit('notification', notification);
  }

  /**
   * Broadcast à tous les clients connectés (tous rôles confondus).
   * Le filtrage côté client décide qui affiche quoi (ex: les non-admins
   * ignorent les événements ldap-pending-new).
   */
  broadcast(event: string, payload: any) {
    this.server.emit(event, payload);
  }
}
