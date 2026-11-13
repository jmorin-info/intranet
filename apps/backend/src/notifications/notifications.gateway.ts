import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../common/interfaces';

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
  private readonly expiryTimers = new WeakMap<Socket, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
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

      const payload = this.jwtService.verify<JwtPayload & { exp?: number }>(token, {
        secret:
          process.env.JWT_ACCESS_SECRET || 'omnitech-access-secret-change-me',
      });

      if (
        typeof payload.sub !== 'string' || !payload.sub ||
        typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) ||
        payload.exp * 1000 <= Date.now()
      ) {
        throw new UnauthorizedException('Invalid or expired session');
      }

      // La signature JWT seule ne reflète pas une désactivation du compte
      // ou une politique d'enrôlement appliquée après l'émission du jeton.
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          isActive: true,
          deletedAt: true,
          mfaRequired: true,
          mfaEnabled: true,
          _count: { select: { webauthnCredentials: true } },
        },
      });
      const enrolled = user?.mfaEnabled || (user?._count.webauthnCredentials ?? 0) > 0;
      if (!user || !user.isActive || user.deletedAt || (user.mfaRequired && !enrolled)) {
        throw new UnauthorizedException('Account unavailable or MFA enrollment required');
      }

      const userId = user.id;
      client.data.userId = userId;

      // Join user-specific room
      await client.join(userId);

      // Une connexion ouverte ne doit pas conserver une session après son JWT.
      const timer = setTimeout(() => {
        this.expiryTimers.delete(client);
        client.disconnect(true);
      }, Math.min(payload.exp * 1000 - Date.now(), 2_147_483_647));
      timer.unref();
      this.expiryTimers.set(client, timer);

      this.logger.log(`Client connected: ${userId}`);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(`Authentication failed: ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const timer = this.expiryTimers.get(client);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(client);
    const userId = client.data?.userId;
    if (userId) {
      this.logger.log(`Client disconnected: ${userId}`);
    }
  }

  async sendToUser(userId: string, notification: any): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          isActive: true,
          deletedAt: true,
          mfaRequired: true,
          mfaEnabled: true,
          _count: { select: { webauthnCredentials: true } },
        },
      });
      const enrolled = user?.mfaEnabled || (user?._count.webauthnCredentials ?? 0) > 0;
      if (!user || !user.isActive || user.deletedAt || (user.mfaRequired && !enrolled)) {
        this.server.in(userId).disconnectSockets(true);
        return;
      }
      this.server.to(userId).emit('notification', notification);
    } catch {
      // A database outage must not deliver private data without checking access.
      this.logger.warn('WebSocket notification withheld: account verification unavailable');
    }
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
