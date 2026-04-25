import { Module } from '@nestjs/common';
import { DepartmentsController } from './departments.controller';
import { DirectoryController } from './directory.controller';
import { DepartmentsService } from './departments.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DepartmentsController, DirectoryController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
