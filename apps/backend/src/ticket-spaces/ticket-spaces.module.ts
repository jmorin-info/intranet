import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { TicketSpacesController } from './ticket-spaces.controller';
import { TicketSpacesService } from './ticket-spaces.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [TicketSpacesController],
  providers: [TicketSpacesService],
  exports: [TicketSpacesService],
})
export class TicketSpacesModule {}
