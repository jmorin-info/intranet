import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MeilisearchController } from './meilisearch.controller';
import { MeilisearchService } from './meilisearch.service';
import { MeiliReindexScheduler } from './meili-reindex.scheduler';

@Module({
  imports: [PrismaModule],
  controllers: [MeilisearchController],
  providers: [MeilisearchService, MeiliReindexScheduler],
  exports: [MeilisearchService],
})
export class MeilisearchModule {}
