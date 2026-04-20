import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RunbooksController } from './runbooks.controller';
import { RunbooksService } from './runbooks.service';

@Module({
  imports: [PrismaModule],
  controllers: [RunbooksController],
  providers: [RunbooksService],
  exports: [RunbooksService],
})
export class RunbooksModule {}
