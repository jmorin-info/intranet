import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ScannerService } from './scanner.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [ScannerService],
  exports: [ScannerService],
})
export class ScannerModule {}
