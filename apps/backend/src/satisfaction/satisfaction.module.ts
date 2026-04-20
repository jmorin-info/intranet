import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SatisfactionController } from './satisfaction.controller';
import { SatisfactionService } from './satisfaction.service';

@Module({
  imports: [PrismaModule],
  controllers: [SatisfactionController],
  providers: [SatisfactionService],
  exports: [SatisfactionService],
})
export class SatisfactionModule {}
