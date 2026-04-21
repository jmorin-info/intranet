import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeedbackDto } from './dto/feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record (or upsert) the feedback for a given message, and verify the user
   * owns the underlying session.
   */
  async submit(messageId: string, userId: string, dto: FeedbackDto) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        role: true,
        session: { select: { userId: true } },
      },
    });

    if (!message) {
      throw new NotFoundException('Message introuvable');
    }
    if (message.session.userId !== userId) {
      // Avoid disclosing existence to another user.
      throw new NotFoundException('Message introuvable');
    }
    if (message.role !== 'ASSISTANT') {
      throw new ConflictException(
        "Le feedback ne peut être soumis que sur un message de l'assistant.",
      );
    }

    return this.prisma.chatMessageFeedback.upsert({
      where: { messageId },
      create: {
        messageId,
        userId,
        rating: dto.rating,
        reason: dto.reason ?? null,
        comment: dto.comment?.trim() || null,
      },
      update: {
        rating: dto.rating,
        reason: dto.reason ?? null,
        comment: dto.comment?.trim() || null,
      },
    });
  }
}
