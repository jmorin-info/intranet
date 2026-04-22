import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MeilisearchModule } from '../search/meilisearch.module';
import { RunbooksController } from './runbooks.controller';
import { RunbooksService } from './runbooks.service';

@Module({
  imports: [PrismaModule, MeilisearchModule],
  controllers: [RunbooksController],
  providers: [RunbooksService],
  exports: [RunbooksService],
})
export class RunbooksModule {}
