import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessReviewsController } from './access-reviews.controller';
import { AccessReviewsService } from './access-reviews.service';

@Module({
  imports: [PrismaModule],
  controllers: [AccessReviewsController],
  providers: [AccessReviewsService],
  exports: [AccessReviewsService],
})
export class AccessReviewsModule {}
