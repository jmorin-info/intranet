import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FrameworksController } from './frameworks.controller';
import { FrameworksService } from './frameworks.service';

@Module({
  imports: [PrismaModule],
  controllers: [FrameworksController],
  providers: [FrameworksService],
  exports: [FrameworksService],
})
export class FrameworksModule {}
