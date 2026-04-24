import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MentionsModule } from '../mentions/mentions.module';
import { MeilisearchModule } from '../search/meilisearch.module';
import { AiModule } from '../ai/ai.module';
import { TicketsController } from './tickets.controller';
import { TicketsRepository } from './tickets.repository';
import { TicketsService } from './tickets.service';

@Module({
  imports: [PrismaModule, NotificationsModule, MentionsModule, MeilisearchModule, AiModule],
  controllers: [TicketsController],
  providers: [TicketsRepository, TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
