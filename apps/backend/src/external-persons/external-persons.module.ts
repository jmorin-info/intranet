import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExternalPersonsController } from './external-persons.controller';
import { ExternalPersonsService } from './external-persons.service';

@Module({
  imports: [PrismaModule],
  controllers: [ExternalPersonsController],
  providers: [ExternalPersonsService],
  exports: [ExternalPersonsService],
})
export class ExternalPersonsModule {}
