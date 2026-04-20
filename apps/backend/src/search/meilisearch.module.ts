import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MeilisearchController } from './meilisearch.controller';
import { MeilisearchService } from './meilisearch.service';

@Module({
  imports: [PrismaModule],
  controllers: [MeilisearchController],
  providers: [MeilisearchService],
  exports: [MeilisearchService],
})
export class MeilisearchModule {}
