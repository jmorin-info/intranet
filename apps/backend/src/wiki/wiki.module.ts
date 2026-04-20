import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MentionsModule } from '../mentions/mentions.module';
import { RagModule } from '../rag/rag.module';
import { MeilisearchModule } from '../search/meilisearch.module';
import { WikiController } from './wiki.controller';
import { WikiService } from './wiki.service';

@Module({
  imports: [PrismaModule, MentionsModule, RagModule, MeilisearchModule],
  controllers: [WikiController],
  providers: [WikiService],
  exports: [WikiService],
})
export class WikiModule {}
