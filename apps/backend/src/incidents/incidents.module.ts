import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IncidentsController } from './incidents.controller';
import { RemediationsController } from './remediations.controller';
import { IncidentsService } from './incidents.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [IncidentsController, RemediationsController],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
