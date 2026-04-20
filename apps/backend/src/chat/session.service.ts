import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ChatSession, ChatSurface } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

export interface ListSessionsArgs {
  userId: string;
  page: number;
  limit: number;
  archived?: boolean;
  surface?: ChatSurface;
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateSessionDto): Promise<ChatSession> {
    return this.prisma.chatSession.create({
      data: {
        userId,
        surface: dto.surface,
        title: dto.title?.trim() || null,
        contextUrl: dto.context?.url || null,
        contextType: dto.context?.contextType || null,
        contextEntityId: dto.context?.entityId || null,
      },
    });
  }

  async list(args: ListSessionsArgs) {
    const where: Prisma.ChatSessionWhereInput = {
      userId: args.userId,
      ...(args.surface ? { surface: args.surface } : {}),
      ...(args.archived === true ? { archivedAt: { not: null } } : {}),
      ...(args.archived === false ? { archivedAt: null } : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.chatSession.count({ where }),
      this.prisma.chatSession.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (args.page - 1) * args.limit,
        take: args.limit,
      }),
    ]);

    return { data, total, page: args.page, limit: args.limit };
  }

  async findById(sessionId: string, userId: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { feedback: true },
        },
      },
    });
    if (!session) throw new NotFoundException('Session introuvable');
    if (session.userId !== userId) {
      // SessionOwnerGuard already handles this but double-guard never hurts.
      throw new NotFoundException('Session introuvable');
    }
    return session;
  }

  async update(sessionId: string, dto: UpdateSessionDto): Promise<ChatSession> {
    const data: Prisma.ChatSessionUpdateInput = {};

    if (dto.title !== undefined) {
      data.title = dto.title.trim() || null;
    }
    if (dto.archived !== undefined) {
      data.archivedAt = dto.archived ? new Date() : null;
    }

    return this.prisma.chatSession.update({ where: { id: sessionId }, data });
  }

  /**
   * Soft delete = archive (archivedAt = now). Kept for API symmetry with
   * other resources. A hard delete cascade-deletes messages, which we don't
   * want in Phase 1 (audit retention).
   */
  async softDelete(sessionId: string): Promise<ChatSession> {
    return this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { archivedAt: new Date() },
    });
  }

  /**
   * Called by ChatStreamService when a new assistant message lands — bumps
   * lastMessageAt so the session floats to the top of the list.
   */
  async touch(sessionId: string): Promise<void> {
    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { lastMessageAt: new Date() },
    });
  }
}
