import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VeilleController } from './veille.controller';
import { VeilleService } from './veille.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [VeilleController],
  providers: [VeilleService],
  exports: [VeilleService],
})
export class VeilleModule {}
